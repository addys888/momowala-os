begin;
create table public.staff_meals (
 operation_id uuid primary key, cart_id text not null references carts(id), business_date date not null,
 staff_id bigint not null references staff(id), staff_name text not null, category text not null,
 quantity integer not null check(quantity between 1 and 10), logged_by bigint not null references staff(id),
 created_at timestamptz not null default now()
);
alter table public.staff_meals enable row level security;
revoke all on public.staff_meals from public,anon,authenticated;
create index staff_meals_cart_day on public.staff_meals(cart_id,business_date);
create function public.app_log_staff_meal(p_cart_id text,p_date date,p_operation_id uuid,p_staff_id bigint,p_category text,p_quantity integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare sess app_sessions:=app_private.session(); prior staff_meals; nm text; blob jsonb; available numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 if not app_private.closing_manager(p_cart_id) then raise exception 'Only the assigned active manager can log staff meals' using errcode='42501'; end if;
 if p_operation_id is null then raise exception 'Meal reference required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,92));
 select * into prior from staff_meals where operation_id=p_operation_id;
 if found then
  if prior.cart_id is distinct from p_cart_id or prior.business_date is distinct from p_date or prior.staff_id is distinct from p_staff_id or prior.category is distinct from p_category or prior.quantity is distinct from p_quantity or prior.logged_by is distinct from sess.staff_id then raise exception 'Meal reference already used';end if;
  return to_jsonb(prior);
 end if;
 if p_date is distinct from app_private.stock_business_date(p_cart_id) then raise exception 'Reload for the current stock day';end if;
 if p_quantity is null or p_quantity not between 1 and 10 then raise exception 'Enter 1 to 10 whole pieces';end if;
 select name into nm from staff where id=p_staff_id and cart_id=p_cart_id and active for share;
 if not found then raise exception 'Choose an active staff member from this cart';end if;
 if not exists(select 1 from opening_loads where cart_id=p_cart_id and business_date=p_date) then raise exception 'Submit opening stock first';end if;
 if exists(select 1 from closing_reports where cart_id=p_cart_id and business_date=p_date and submitted_at is not null) or exists(select 1 from day_close_logs where cart_id=p_cart_id and date=p_date and closed_at is not null) then raise exception 'This day is closed';end if;
 if not exists(select 1 from menus cross join lateral jsonb_array_elements(data->p_cart_id->'stockTypes') t where id=1 and t->>'key'=p_category) then raise exception 'Unknown category';end if;
 perform app_private.roll_stock_day(p_cart_id);
 select data into blob from inventory where id=1 for update;
 available:=(blob->p_cart_id->p_category->>'cart')::numeric;
 if available is null or available<p_quantity then raise exception 'Insufficient recorded stock. Ask the owner to review stock entries.';end if;
 update inventory set data=jsonb_set(blob,array[p_cart_id,p_category,'cart'],to_jsonb(available-p_quantity)),updated_at=now() where id=1;
 insert into staff_meals(operation_id,cart_id,business_date,staff_id,staff_name,category,quantity,logged_by) values(p_operation_id,p_cart_id,p_date,p_staff_id,nm,p_category,p_quantity,sess.staff_id) returning * into prior;
 return to_jsonb(prior);
end $$;
create function public.app_staff_meals(p_cart_id text,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) and not app_private.closing_manager(p_cart_id) then raise exception 'Not authorised' using errcode='42501';end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(m) order by created_at desc),'[]') from staff_meals m where cart_id=p_cart_id and business_date=p_date),'total',(select coalesce(sum(quantity),0) from staff_meals where cart_id=p_cart_id and business_date=p_date));
end $$;
revoke all on function public.app_log_staff_meal(text,date,uuid,bigint,text,integer),public.app_staff_meals(text,date) from public,anon,authenticated;
grant execute on function public.app_log_staff_meal(text,date,uuid,bigint,text,integer),public.app_staff_meals(text,date) to anon;
create function public.app_read_all_partner_notifications(p_cart_id text,p_through bigint) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare s app_sessions:=app_private.session();
begin
 if not app_private.allowed(p_cart_id) then raise exception 'Not authorised' using errcode='42501';end if;
 insert into app_private.partner_notification_reads(notification_id,principal)
 select id,s.role||':'||p_cart_id||':'||coalesce(s.staff_id::text,'owner') from partner_notifications where cart_id=p_cart_id and id<=p_through and audience=case when s.role='staff' then 'staff' else 'owner' end and kind not in ('order','cancel','payment') on conflict do nothing;
end $$;
revoke all on function public.app_read_all_partner_notifications(text,bigint) from public,anon,authenticated;
grant execute on function public.app_read_all_partner_notifications(text,bigint) to anon;
create function app_private.manager_off(cid text,d date) returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private as $$
 select exists(select 1 from cart_opening_managers m join staff_hr h on h.staff_id=m.staff_id and h.cart_id=m.cart_id where m.cart_id=cid and ((h.details->'daysOff'->d::text is not null and h.details->'daysOff'->d::text<>'null'::jsonb) or (h.details->'daysOff'->((now() at time zone 'Asia/Kolkata')::date)::text is not null and h.details->'daysOff'->((now() at time zone 'Asia/Kolkata')::date)::text<>'null'::jsonb)));
$$;
revoke all on function app_private.manager_off(text,date) from public,anon,authenticated;
create or replace function app_private.closing_snapshot(p_cart_id text,p_report_id bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare r closing_reports; expected jsonb; current_day date; stock jsonb;
begin

 select * into r from closing_reports where id=p_report_id and cart_id=p_cart_id;
 if not found then raise exception 'Closing report not found';end if;
 if r.expected_quantities is not null then return r.expected_quantities;end if;
 select data->p_cart_id into stock from inventory where id=1 for share;
 select business_date into current_day from app_private.inventory_days where cart_id=p_cart_id;
 if current_day=r.business_date then
  select jsonb_object_agg(t->>'key',(stock->(t->>'key')->>'cart')::numeric) into expected from jsonb_array_elements(r.stock_types) t;
 else select quantities into expected from cart_stock_rollovers where cart_id=p_cart_id and business_date=r.business_date;
 end if;
 if expected is null or exists(select 1 from jsonb_array_elements(r.stock_types) t where expected->(t->>'key') is null or expected->(t->>'key')='null'::jsonb) then return null;end if;
 return expected;
end $$;
revoke all on function app_private.closing_snapshot(text,bigint) from public,anon,authenticated;
create or replace function public.app_closing_stock_check(p_cart_id text,p_report_id bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then if app_private.closing_manager(p_cart_id) then return '{}'::jsonb;else raise exception 'Not authorised' using errcode='42501';end if;end if;
 return app_private.closing_snapshot(p_cart_id,p_report_id);
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
  if r.operation_id=p_operation_id and r.cash_count=p_cash and r.quantities=p_quantities and r.notes=coalesce(p_notes,'') then return to_jsonb(r)-'expected_quantities'; end if;
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
 perform 1 from inventory where id=1 for update;
 update closing_reports set expected_quantities=app_private.closing_snapshot(p_cart_id,p_report_id),cash_count=p_cash,quantities=p_quantities,notes=coalesce(p_notes,''),submitted_by=s.staff_id,submitted_name=s.name,submitted_at=now(),operation_id=p_operation_id where id=r.id returning * into r;
 return to_jsonb(r)-'expected_quantities';
end $$;
create or replace function public.app_submit_closing_checked(p_cart_id text,p_report_id bigint,p_operation_id uuid,p_cash numeric,p_quantities jsonb,p_expected jsonb,p_notes text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 return app_submit_closing(p_cart_id,p_report_id,p_operation_id,p_cash,p_quantities,p_notes)-'expected_quantities';
end $$;
create or replace function public.app_closing_status(p_cart_id text)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare cfg cart_closing_settings; reports jsonb; manager boolean;
begin
 manager:=app_private.closing_manager(p_cart_id);
 if not manager and not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Only the cart manager or owner can access closing reports' using errcode='42501'; end if;
 perform app_private.collect_closing_reports(now(),p_cart_id);
 select * into cfg from cart_closing_settings where cart_id=p_cart_id;
 select coalesce(jsonb_agg((case when app_private.allowed(p_cart_id,array['owner','admin']) then to_jsonb(r) else to_jsonb(r)-'expected_quantities' end)||jsonb_build_object('reminderKey',case when not app_private.manager_off(p_cart_id,r.business_date) and r.submitted_at is null then 'closing-manager-'||r.id||'-'||(select revision from cart_opening_managers where cart_id=p_cart_id)||'-'||cfg.revision||'-'||greatest(0,floor(extract(epoch from (now()-r.due_at))/600))::bigint else null end) order by r.business_date desc),'[]') into reports from
 (select * from closing_reports where cart_id=p_cart_id and (submitted_at is null or owner_read_at is null or business_date>=(now() at time zone 'Asia/Kolkata')::date-60)) r;
 return jsonb_build_object('settings',coalesce(to_jsonb(cfg),jsonb_build_object('enabled',false,'closing_time','22:00:00','revision',0)), 'canSubmit',manager,'managerRevision',(select revision from cart_opening_managers where cart_id=p_cart_id),'reports',reports,'serverNow',now());
end $$;
create or replace function public.app_claim_closing_notifications() returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 perform app_private.collect_closing_reports(now());
 -- Each assignment revision gets its own alert identity. Reassignment cancels old phones.
 insert into app_private.closing_deliveries(report_id,endpoint,tag,mode,staff_id,manager_revision,config_revision)
 select r.id,s.endpoint,'closing-manager-'||r.id||'-'||m.revision||'-'||cfg.revision||'-'||greatest(0,floor(extract(epoch from (now()-r.due_at))/600))::bigint,'closing_due',m.staff_id,m.revision,cfg.revision
 from closing_reports r join cart_closing_settings cfg on cfg.cart_id=r.cart_id and cfg.enabled
 join carts c on c.id=r.cart_id and c.active
 join cart_opening_managers m on m.cart_id=r.cart_id join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active
 join push_subscriptions s on s.cart_id=r.cart_id and s.role='staff' and s.staff_id=m.staff_id
 where r.submitted_at is null and not app_private.manager_off(r.cart_id,r.business_date) on conflict do nothing;
 insert into app_private.closing_deliveries(report_id,endpoint,tag,mode)
 select r.id,s.endpoint,'closing-owner-'||r.id,'closing_report' from closing_reports r join push_subscriptions s on s.cart_id=r.cart_id and s.role='owner'
 where r.submitted_at is not null and r.owner_read_at is null on conflict do nothing;
 update app_private.closing_deliveries d set mode='closing_stop',sent_at=null,retry_at=now(),lease=null
 from closing_reports r where r.id=d.report_id and d.mode<>'closing_stop' and
 ((d.mode='closing_report' and r.owner_read_at is not null) or (d.mode='closing_due' and
 (r.submitted_at is not null or app_private.manager_off(r.cart_id,r.business_date) or d.tag <> 'closing-manager-'||r.id||'-'||d.manager_revision||'-'||d.config_revision||'-'||greatest(0,floor(extract(epoch from (now()-r.due_at))/600))::bigint or not exists(select 1 from cart_closing_settings cfg join carts c on c.id=cfg.cart_id and c.active
 join cart_opening_managers m on m.cart_id=cfg.cart_id join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active
 where cfg.cart_id=r.cart_id and cfg.enabled and m.staff_id=d.staff_id and m.revision=d.manager_revision and cfg.revision=d.config_revision))));
 with due as (
 select d.report_id,d.endpoint,d.tag from app_private.closing_deliveries d join closing_reports r on r.id=d.report_id
 join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=r.cart_id
 where d.sent_at is null and d.retry_at<=now() and (d.mode='closing_stop' or (d.mode='closing_report' and s.role='owner') or (d.mode='closing_due' and s.role='staff' and s.staff_id=d.staff_id))
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
do $patch$ declare f text;begin
 f:=pg_get_functiondef('app_private.refresh_daily_profit(text,date)'::regprocedure);
 f:=replace(f,'wasted numeric;','wasted numeric; meals numeric; meal_cost numeric:=0;');
 f:=replace(f,'(loaded<>0 or sold<>0 or coalesce(remaining,0)<>0)','(loaded<>0 or sold<>0 or meals<>0 or coalesce(remaining,0)<>0)');
 f:=replace(f,'remaining:=(counts->>k)::numeric;', 'select coalesce(sum(quantity),0) into meals from public.staff_meals where cart_id=cid and business_date=d and category=k; remaining:=(counts->>k)::numeric;');
 f:=replace(f,'expected:=loaded-returned+adjusted-sold-pending_pcs-wasted;', 'expected:=loaded-returned+adjusted-sold-pending_pcs-wasted-meals; meal_cost:=meal_cost+meals*coalesce(rate,0);');
 f:=replace(f,'''wasted'',wasted,','''staffMeals'',meals,''staffMealCost'',meals*rate,''wasted'',wasted,');
 f:=replace(f,'sale_total-ingredient-overhead end','sale_total-ingredient-overhead-meal_cost end');
 f:=replace(f,'''source'',src,''sales'',sale_total,','''staffMealCost'',meal_cost,''source'',src,''sales'',sale_total,');
 execute f;
end $patch$;
create constraint trigger daily_profit_changed after insert on public.staff_meals deferrable initially deferred for each row execute function app_private.profit_changed();
commit;
