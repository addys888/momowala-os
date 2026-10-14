-- Manager assignment is independent of editable staff profiles and checked on every load.
create table if not exists public.cart_opening_managers (
 cart_id text primary key references public.carts(id), staff_id bigint references public.staff(id) on delete set null,
 revision bigint not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.opening_manager_audit (
 id bigint generated always as identity primary key, cart_id text not null,
 previous_staff_id bigint, staff_id bigint, actor_role text not null, actor_name text,
 created_at timestamptz not null default now()
);
create table if not exists public.opening_alerts (
 id bigint generated always as identity primary key, cart_id text not null references public.carts(id),
 business_date date not null, kind text not null check(kind in ('completed','missed','manager_reminder')),
 staff_id bigint, title text not null, body text not null,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(cart_id,business_date,kind)
);
alter table public.cart_opening_managers enable row level security;
alter table public.opening_manager_audit enable row level security;
alter table public.opening_alerts enable row level security;
revoke all on public.cart_opening_managers,public.opening_manager_audit,public.opening_alerts from public,anon,authenticated;
grant select on public.cart_opening_managers,public.opening_manager_audit,public.opening_alerts to anon;
drop policy if exists scoped_read on public.cart_opening_managers;
create policy scoped_read on public.cart_opening_managers for select to anon using(app_private.allowed(cart_id));
drop policy if exists scoped_read on public.opening_manager_audit;
create policy scoped_read on public.opening_manager_audit for select to anon using(app_private.allowed(cart_id,array['owner','admin']));
drop policy if exists scoped_read on public.opening_alerts;
create policy scoped_read on public.opening_alerts for select to anon using(kind<>'manager_reminder' and app_private.allowed(cart_id,array['owner','admin']));

create or replace function public.app_assign_opening_manager(p_cart_id text,p_staff_id bigint,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); r cart_opening_managers;
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 select * into r from cart_opening_managers where cart_id=p_cart_id;
 if coalesce(r.revision,0) is distinct from p_revision then return jsonb_build_object('status','conflict','message','Manager assignment changed on another phone. Reload and try again.'); end if;
 if p_staff_id is not null and not exists(select 1 from staff where id=p_staff_id and cart_id=p_cart_id and active) then raise exception 'Choose an active staff member from this cart'; end if;
 if r.staff_id is not distinct from p_staff_id then return jsonb_build_object('status','ok'); end if;
 insert into opening_manager_audit(cart_id,previous_staff_id,staff_id,actor_role,actor_name) values(p_cart_id,r.staff_id,p_staff_id,s.role,s.name);
 insert into cart_opening_managers(cart_id,staff_id) values(p_cart_id,p_staff_id)
 on conflict(cart_id) do update set staff_id=excluded.staff_id,revision=cart_opening_managers.revision+1,updated_at=now();
 return jsonb_build_object('status','ok');
end $$;

create or replace function public.app_opening_status(p_cart_id text,p_date date)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); m record; assignment cart_opening_managers; r opening_loads;
begin
 if not app_private.allowed(p_cart_id) then raise exception 'Not authorised' using errcode='42501'; end if;
 select * into assignment from cart_opening_managers where cart_id=p_cart_id;
 select id,name,active into m from staff where id=assignment.staff_id and cart_id=p_cart_id;
 select * into r from opening_loads where cart_id=p_cart_id and business_date=p_date;
 return jsonb_build_object('record',case when r.cart_id is null then null else to_jsonb(r) end,
 'managerId',assignment.staff_id,'managerName',m.name,'managerActive',coalesce(m.active,false),'revision',coalesce(assignment.revision,0),
 'canLoad',coalesce(s.role='staff' and s.staff_id=m.id and m.active,false));
end $$;

create or replace function public.app_read_opening_alert(p_id bigint)
returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 update opening_alerts set read_at=coalesce(read_at,now()) where id=p_id and kind<>'manager_reminder' and app_private.allowed(cart_id,array['owner','admin']);
end $$;

alter table public.push_subscriptions add column if not exists staff_id bigint;
create or replace function public.app_identity() returns jsonb
language sql stable security definer set search_path=public,app_private as $$
 select jsonb_build_object('role',s.role,'cartId',s.cart_id,'name',s.name,'staffId',s.staff_id,'expiresAt',extract(epoch from s.expires_at)*1000) from app_private.session() s;
$$;

-- Events survive offline phones. A per-endpoint lease permits retries without losing
-- successful deliveries when another device fails. Provider acknowledgments are not reads.
create table if not exists app_private.opening_deliveries (
 alert_id bigint not null references public.opening_alerts(id) on delete cascade, endpoint text not null,
 lease uuid, retry_at timestamptz not null default now(), sent_at timestamptz, attempts int not null default 0,
 primary key(alert_id,endpoint)
);
alter table app_private.opening_deliveries enable row level security;
revoke all on app_private.opening_deliveries from public,anon,authenticated;

create or replace function app_private.collect_opening_alerts(p_now timestamptz)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare c record; d date; opens timestamptz; loaded opening_loads; manager record;
begin
 -- Include tomorrow for midnight openings whose reminder starts today.
 for c in select * from carts where active and open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' loop
  for d in select ((p_now at time zone 'Asia/Kolkata')::date+i) from generate_series(0,1) i loop
   opens:=(d+c.open_time::time) at time zone 'Asia/Kolkata';
   if p_now<opens-interval '30 minutes' then continue; end if;
   perform pg_advisory_xact_lock(hashtextextended(c.id||':'||d::text,2));
   select * into loaded from opening_loads where cart_id=c.id and business_date=d;
   select t.id,t.name into manager from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active where m.cart_id=c.id;
   if loaded.cart_id is null or loaded.created_at>opens then
    if p_now<opens and manager.id is not null and loaded.cart_id is null then
     insert into opening_alerts(cart_id,business_date,kind,staff_id,title,body)
     values(c.id,d,'manager_reminder',manager.id,c.name||': opening stock due','Load opening stock before '||c.open_time||' IST. The owner will be alerted if it is still missing at opening.')
     on conflict(cart_id,business_date,kind) do update set staff_id=excluded.staff_id where opening_alerts.staff_id is distinct from excluded.staff_id;
    elsif p_now>=opens then
     insert into opening_alerts(cart_id,business_date,kind,staff_id,title,body)
     values(c.id,d,'missed',manager.id,c.name||': opening stock missing',coalesce(manager.name,'No active manager assigned')||' — opening stock was not submitted by '||c.open_time||' IST. Please follow up.') on conflict do nothing;
    end if;
   end if;
  end loop;
 end loop;
end $$;
revoke all on function app_private.collect_opening_alerts(timestamptz) from public,anon,authenticated;

create or replace function public.app_claim_opening_notifications()
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 perform app_private.collect_opening_alerts(now());
 insert into app_private.opening_deliveries(alert_id,endpoint)
 select a.id,s.endpoint from opening_alerts a join push_subscriptions s on s.cart_id=a.cart_id
 where a.created_at>now()-interval '1 day' and
 ((a.kind<>'manager_reminder' and s.role='owner') or (a.kind='manager_reminder' and s.role='staff' and s.staff_id=a.staff_id))
 on conflict do nothing;
 with due as (
  select d.alert_id,d.endpoint from app_private.opening_deliveries d
  join opening_alerts a on a.id=d.alert_id join carts c on c.id=a.cart_id and c.active join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=a.cart_id
  where d.sent_at is null and d.retry_at<=now() and a.created_at>now()-interval '1 day'
  and ((a.kind<>'manager_reminder' and s.role='owner') or
   (a.kind='manager_reminder' and s.role='staff' and s.staff_id=a.staff_id
    and c.open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and now() < ((a.business_date+c.open_time::time) at time zone 'Asia/Kolkata')
    and exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.active where m.cart_id=a.cart_id and m.staff_id=a.staff_id)
    and not exists(select 1 from opening_loads l where l.cart_id=a.cart_id and l.business_date=a.business_date)))
  order by a.id limit 20 for update of d skip locked
 ), claimed as (
  update app_private.opening_deliveries d set lease=gen_random_uuid(),retry_at=now()+interval '2 minutes',attempts=attempts+1
  from due where d.alert_id=due.alert_id and d.endpoint=due.endpoint returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'lease',d.lease,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'title',a.title,'body',a.body,'kind',a.kind)), '[]') into result
 from claimed d join opening_alerts a on a.id=d.alert_id join push_subscriptions s on s.endpoint=d.endpoint;
 return result;
end $$;

create or replace function public.app_finish_opening_notification(p_id bigint,p_endpoint text,p_lease uuid,p_sent boolean,p_dead boolean default false)
returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 update app_private.opening_deliveries set sent_at=case when p_sent or p_dead then now() else null end,
 retry_at=now()+least(attempts,30)*interval '1 minute',lease=null where alert_id=p_id and endpoint=p_endpoint and lease=p_lease;
 if found and p_dead then delete from push_subscriptions where endpoint=p_endpoint; end if;
end $$;
revoke all on function public.app_assign_opening_manager(text,bigint,bigint),public.app_opening_status(text,date),public.app_read_opening_alert(bigint),public.app_claim_opening_notifications(),public.app_finish_opening_notification(bigint,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.app_assign_opening_manager(text,bigint,bigint),public.app_opening_status(text,date),public.app_read_opening_alert(bigint),public.app_claim_opening_notifications(),public.app_finish_opening_notification(bigint,text,uuid,boolean,boolean) to anon;

create or replace function public.app_load_opening_inventory(p_cart_id text,p_date date,p_operation_id uuid,p_quantities jsonb)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); existing opening_loads; blob jsonb; ci jsonb; k text; qty jsonb; n numeric; f numeric; c numeric; today date:=(now() at time zone 'Asia/Kolkata')::date; tomorrow_open timestamp; expected_date date;
begin
 if not app_private.allowed(p_cart_id,array['staff']) then raise exception 'Not authorised: only the assigned manager can load opening stock' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 if not exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active where m.cart_id=p_cart_id and m.staff_id=s.staff_id) then
  raise exception 'Only the assigned active manager can load opening stock' using errcode='42501';
 end if;
 perform 1 from staff where id=s.staff_id and active for share;
 if not found then raise exception 'Manager account is no longer active' using errcode='42501'; end if;
 select (today+1)+coalesce(nullif(open_time,''),'16:00')::time into tomorrow_open from carts where id=p_cart_id;
 expected_date:=case when (now() at time zone 'Asia/Kolkata')>=tomorrow_open-interval '30 minutes' then today+1 else today end;
 if p_date is null or p_date<>expected_date then raise exception 'Reload before loading a new business day'; end if;
 if p_operation_id is null or p_quantities is null or jsonb_typeof(p_quantities)<>'object' or p_quantities='{}' then raise exception 'Enter opening quantities'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id||':'||p_date::text,2));
 select * into existing from opening_loads where cart_id=p_cart_id and business_date=p_date;
 if found then
  if existing.operation_id=p_operation_id and existing.quantities=p_quantities then return jsonb_build_object('status','ok','record',to_jsonb(existing)); end if;
  return jsonb_build_object('status','conflict','message','Opening stock has already been loaded today. Refresh to see the saved quantities.','record',to_jsonb(existing));
 end if;
 select data into blob from inventory where id=1 for update;
 ci:=coalesce(blob->p_cart_id,'{}');
 for k,qty in select * from jsonb_each(p_quantities) loop
  if not ci ? k or k='consumables' or jsonb_typeof(qty)<>'number' then raise exception 'Unknown stock item or invalid quantity'; end if;
  n:=(qty#>>'{}')::numeric;
  if n<=0 or n<>trunc(n) or n>100000 then raise exception 'Use positive whole-piece quantities'; end if;
  f:=coalesce((ci->k->>'freezer')::numeric,0); c:=coalesce((ci->k->>'cart')::numeric,0);
  if n>f then raise exception 'Not enough freezer stock for %',k; end if;
  ci:=jsonb_set(ci,array[k],jsonb_build_object('freezer',f-n,'cart',c+n));
  insert into cart_loadings(id,cart_id,date,time,type,item,qty,note) values(nextval('app_private.opening_log_id'),p_cart_id,p_date,to_char(now() at time zone 'Asia/Kolkata','HH24:MI'),'CART_LOAD',k,n::integer,'Opening stock transfer');
 end loop;
 update inventory set data=jsonb_set(blob,array[p_cart_id],ci,true),updated_at=now() where id=1;
 insert into opening_loads(cart_id,business_date,operation_id,quantities,actor_role,actor_name)
 values(p_cart_id,p_date,p_operation_id,p_quantities,s.role,s.name) returning * into existing;
 insert into opening_alerts(cart_id,business_date,kind,staff_id,title,body)
 select p_cart_id,p_date,'completed',s.staff_id,name||': opening stock loaded',s.name||' loaded '||(select sum(value::numeric) from jsonb_each_text(p_quantities))::text||' pieces. View the saved quantities in Stock.' from carts where id=p_cart_id
 on conflict do nothing;
 return jsonb_build_object('status','ok','record',to_jsonb(existing),'cartInv',ci);
end $$;
revoke all on function public.app_load_opening_inventory(text,date,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.app_load_opening_inventory(text,date,uuid,jsonb) to anon;
notify pgrst,'reload schema';
