-- Closing counts are a manager handover, not a second revenue/stock mutation.
create table if not exists public.cart_closing_settings (
 cart_id text primary key references public.carts(id), enabled boolean not null default false,
 closing_time time not null default '22:00', revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table if not exists public.closing_reports (
 id bigint generated always as identity primary key, cart_id text not null references public.carts(id),
 business_date date not null, due_at timestamptz not null, stock_types jsonb not null,
 cash_count numeric(12,2), quantities jsonb, notes text, submitted_by bigint, submitted_name text,
 submitted_at timestamptz, operation_id uuid unique, owner_read_at timestamptz,
 unique(cart_id,business_date)
);
create table if not exists app_private.closing_deliveries (
 report_id bigint not null references public.closing_reports(id), endpoint text not null,
 tag text not null, mode text not null, staff_id bigint, manager_revision bigint, config_revision bigint,
 lease uuid, retry_at timestamptz not null default now(), sent_at timestamptz,
 primary key(report_id,endpoint,tag)
);
alter table public.cart_closing_settings enable row level security;
alter table public.closing_reports enable row level security;
alter table app_private.closing_deliveries enable row level security;
revoke all on public.cart_closing_settings,public.closing_reports,app_private.closing_deliveries from public,anon,authenticated;
grant select on public.cart_closing_settings to anon;
drop policy if exists scoped_read on public.cart_closing_settings;
create policy scoped_read on public.cart_closing_settings for select to anon using(app_private.allowed(cart_id) or app_private.backend());
-- All report access passes through checked RPCs. Other staff cannot read counts.
create or replace function app_private.closing_manager(p_cart text) returns boolean language sql stable security definer set search_path=public,app_private as $$
 select coalesce(exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active
 where m.cart_id=p_cart and m.staff_id=(app_private.session()).staff_id) and app_private.allowed(p_cart,array['staff']),false);
$$;
create or replace function public.app_save_closing_settings(p_cart_id text,p_enabled boolean,p_time text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare r cart_closing_settings;
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_enabled is null or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose a valid closing time'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 select * into r from cart_closing_settings where cart_id=p_cart_id;
 if coalesce(r.revision,0) is distinct from p_revision then raise exception 'Closing settings changed. Reload and retry.'; end if;
 if p_enabled and not exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active where m.cart_id=p_cart_id) then raise exception 'Assign an active cart manager first'; end if;
 insert into cart_closing_settings(cart_id,enabled,closing_time) values(p_cart_id,p_enabled,p_time::time)
 on conflict(cart_id) do update set enabled=excluded.enabled,closing_time=excluded.closing_time,revision=cart_closing_settings.revision+1,updated_at=now() returning * into r;
 return to_jsonb(r);
end $$;
create or replace function app_private.collect_closing_reports(p_now timestamptz,p_cart text default null)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare c record; d date; due timestamptz; items jsonb;
begin
 for c in select s.* from cart_closing_settings s join carts cart on cart.id=s.cart_id and cart.active where s.enabled and (p_cart is null or s.cart_id=p_cart) loop
  -- Catch a missed midnight cron run, without creating historical reports before enablement.
  for d in select (p_now at time zone 'Asia/Kolkata')::date-i from generate_series(0,1) i loop
   due:=(d+c.closing_time) at time zone 'Asia/Kolkata';
   if due>p_now or due<c.updated_at then continue; end if;
   select coalesce(data->c.cart_id->'stockTypes','[]'::jsonb) into items from menus where id=1;
   insert into closing_reports(cart_id,business_date,due_at,stock_types) values(c.cart_id,d,due,coalesce(items,'[]')) on conflict do nothing;
  end loop;
 end loop;
end $$;
create or replace function public.app_closing_status(p_cart_id text)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare cfg cart_closing_settings; reports jsonb; manager boolean;
begin
 manager:=app_private.closing_manager(p_cart_id);
 if not manager and not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Only the cart manager or owner can access closing reports' using errcode='42501'; end if;
 perform app_private.collect_closing_reports(now(),p_cart_id);
 select * into cfg from cart_closing_settings where cart_id=p_cart_id;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.business_date desc),'[]') into reports from
 (select * from closing_reports where cart_id=p_cart_id and (submitted_at is null or owner_read_at is null or business_date>=(now() at time zone 'Asia/Kolkata')::date-60)) r;
 return jsonb_build_object('settings',coalesce(to_jsonb(cfg),jsonb_build_object('enabled',false,'closing_time','22:00:00','revision',0)), 'canSubmit',manager,'managerRevision',(select revision from cart_opening_managers where cart_id=p_cart_id),'reports',reports,'serverNow',now());
end $$;
create or replace function public.app_submit_closing(p_cart_id text,p_report_id bigint,p_operation_id uuid,p_cash numeric,p_quantities jsonb,p_notes text default '')
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare r closing_reports; s app_sessions:=app_private.session(); item jsonb; n numeric; keys int;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 if not app_private.closing_manager(p_cart_id) then raise exception 'Only the assigned active manager can submit closing' using errcode='42501'; end if;
 perform 1 from staff where id=s.staff_id and active for share;
 if not found then raise exception 'Manager account is inactive'; end if;
 select * into r from closing_reports where id=p_report_id and cart_id=p_cart_id for update;
 if not found then raise exception 'Closing report not found'; end if;
 if r.submitted_at is not null then
  if r.operation_id=p_operation_id and r.cash_count=p_cash and r.quantities=p_quantities and r.notes=coalesce(p_notes,'') then return to_jsonb(r); end if;
  raise exception 'Closing already submitted. Reload to view the saved report.';
 end if;
 if not exists(select 1 from cart_closing_settings where cart_id=p_cart_id and enabled) then raise exception 'Closing workflow is disabled'; end if;
 if now()<r.due_at then raise exception 'Closing is not due yet'; end if;
 if p_operation_id is null or p_cash is null or p_cash<0 or p_cash>10000000 or p_cash<>round(p_cash,2) then raise exception 'Enter a valid cash count (up to two decimals)'; end if;
 if p_quantities is null or jsonb_typeof(p_quantities)<>'object' or length(coalesce(p_notes,''))>1000 then raise exception 'Enter all stock counts and a note under 1000 characters'; end if;
 select count(*) into keys from jsonb_object_keys(p_quantities);
 if keys<>jsonb_array_length(r.stock_types) then raise exception 'Count every stock item'; end if;
 for item in select value from jsonb_array_elements(r.stock_types) loop
  if not p_quantities ? (item->>'key') or jsonb_typeof(p_quantities->(item->>'key'))<>'number' then raise exception 'Count every stock item'; end if;
  n:=(p_quantities->>(item->>'key'))::numeric;
  if n<0 or n>100000 or n<>trunc(n) then raise exception 'Stock counts must be whole pieces, zero or more'; end if;
 end loop;
 update closing_reports set cash_count=p_cash,quantities=p_quantities,notes=coalesce(p_notes,''),submitted_by=s.staff_id,submitted_name=s.name,submitted_at=now(),operation_id=p_operation_id where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
create or replace function public.app_ack_closing(p_cart_id text,p_report_id bigint) returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 update closing_reports set owner_read_at=coalesce(owner_read_at,now()) where id=p_report_id and cart_id=p_cart_id and submitted_at is not null;
 if not found then raise exception 'Submitted closing report not found'; end if;
end $$;
create or replace function public.app_claim_closing_notifications() returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 perform app_private.collect_closing_reports(now());
 -- Each assignment revision gets its own alert identity. Reassignment cancels old phones.
 insert into app_private.closing_deliveries(report_id,endpoint,tag,mode,staff_id,manager_revision,config_revision)
 select r.id,s.endpoint,'closing-manager-'||r.id||'-'||m.revision||'-'||cfg.revision,'closing_due',m.staff_id,m.revision,cfg.revision
 from closing_reports r join cart_closing_settings cfg on cfg.cart_id=r.cart_id and cfg.enabled
 join carts c on c.id=r.cart_id and c.active
 join cart_opening_managers m on m.cart_id=r.cart_id join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active
 join push_subscriptions s on s.cart_id=r.cart_id and s.role='staff' and s.staff_id=m.staff_id
 where r.submitted_at is null on conflict do nothing;
 insert into app_private.closing_deliveries(report_id,endpoint,tag,mode)
 select r.id,s.endpoint,'closing-owner-'||r.id,'closing_report' from closing_reports r join push_subscriptions s on s.cart_id=r.cart_id and s.role='owner'
 where r.submitted_at is not null and r.owner_read_at is null on conflict do nothing;
 update app_private.closing_deliveries d set mode='closing_stop',sent_at=null,retry_at=now(),lease=null
 from closing_reports r where r.id=d.report_id and d.mode<>'closing_stop' and
 ((d.mode='closing_report' and r.owner_read_at is not null) or (d.mode='closing_due' and
 (r.submitted_at is not null or not exists(select 1 from cart_closing_settings cfg join carts c on c.id=cfg.cart_id and c.active
 join cart_opening_managers m on m.cart_id=cfg.cart_id join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active
 where cfg.cart_id=r.cart_id and cfg.enabled and m.staff_id=d.staff_id and m.revision=d.manager_revision and cfg.revision=d.config_revision))));
 with due as (
 select d.report_id,d.endpoint,d.tag from app_private.closing_deliveries d join closing_reports r on r.id=d.report_id
 join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=r.cart_id
 where (d.sent_at is null or (d.mode<>'closing_stop' and d.sent_at<now()-interval '5 minutes')) and d.retry_at<=now() and (d.mode='closing_stop' or (d.mode='closing_report' and s.role='owner') or (d.mode='closing_due' and s.role='staff' and s.staff_id=d.staff_id))
 order by (d.mode='closing_stop') desc,r.due_at limit 50 for update of d skip locked
 ), claimed as (
 update app_private.closing_deliveries d set lease=gen_random_uuid(),retry_at=now()+interval '2 minutes' from due
 where (d.report_id,d.endpoint,d.tag)=(due.report_id,due.endpoint,due.tag) returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'lease',d.lease,'tag',d.tag,'mode',d.mode,'cartId',r.cart_id,'date',r.business_date,
 'title',case when d.mode='closing_due' then c.name||': submit closing counts' else c.name||': closing report' end,
 'body',case when d.mode='closing_due' then 'Count cash and remaining stock. Ringing stops after your report is saved.' else coalesce(r.submitted_name,'Manager')||' submitted closing. Open Reconcile to review and acknowledge.' end)),'[]') into result
 from claimed d join closing_reports r on r.id=d.report_id join carts c on c.id=r.cart_id join push_subscriptions s on s.endpoint=d.endpoint;
 return result;
end $$;
create or replace function public.app_finish_closing_notification(p_id bigint,p_endpoint text,p_tag text,p_lease uuid,p_sent boolean,p_dead boolean default false)
returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 update app_private.closing_deliveries set sent_at=case when p_sent or p_dead then now() else null end,retry_at=now()+interval '1 minute',lease=null
 where report_id=p_id and endpoint=p_endpoint and tag=p_tag and lease=p_lease;
 if found and p_dead then delete from push_subscriptions where endpoint=p_endpoint; end if;
end $$;
revoke all on function app_private.closing_manager(text),app_private.collect_closing_reports(timestamptz,text) from public,anon,authenticated;
revoke all on function public.app_save_closing_settings(text,boolean,text,bigint),public.app_closing_status(text),public.app_submit_closing(text,bigint,uuid,numeric,jsonb,text),public.app_ack_closing(text,bigint),public.app_claim_closing_notifications(),public.app_finish_closing_notification(bigint,text,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.app_save_closing_settings(text,boolean,text,bigint),public.app_closing_status(text),public.app_submit_closing(text,bigint,uuid,numeric,jsonb,text),public.app_ack_closing(text,bigint),public.app_claim_closing_notifications(),public.app_finish_closing_notification(bigint,text,text,uuid,boolean,boolean) to anon;
notify pgrst,'reload schema';
