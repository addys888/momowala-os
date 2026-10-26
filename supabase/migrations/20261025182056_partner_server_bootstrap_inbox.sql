begin;
-- One authenticated round-trip; no device snapshots and no PostgREST row cap.
create or replace function public.app_partner_bootstrap() returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); result jsonb;
begin
 if s.role is null or s.role not in ('admin','owner','staff') then raise exception 'Sign in required' using errcode='42501'; end if;
 result:=jsonb_build_object('inventory',app_inventory(),'catalog',app_catalog(),'menus',(select case when s.role='admin' then data else jsonb_build_object(s.cart_id,coalesce(data->s.cart_id,'{}'::jsonb)) end from menus where id=1));
 result:=result||jsonb_build_object('orders',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select * from orders where s.role='admin' or cart_id=s.cart_id order by id) r));
 result:=result||jsonb_build_object('stock_logs',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select * from stock_logs where s.role='admin' or cart_id=s.cart_id order by id) r));
 result:=result||jsonb_build_object('cart_loadings',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select * from cart_loadings where s.role='admin' or cart_id=s.cart_id order by id) r));
 result:=result||jsonb_build_object('day_close_logs',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select * from day_close_logs where s.role='admin' or cart_id=s.cart_id order by id) r));
 result:=result||jsonb_build_object('wastage_logs',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select * from wastage_logs where s.role='admin' or cart_id=s.cart_id order by id) r));
 result:=result||jsonb_build_object('expenses',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select * from expenses where s.role='admin' or cart_id=s.cart_id order by id) r));
 result:=result||jsonb_build_object('payout_marks',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select * from payout_marks where s.role='admin' or cart_id=s.cart_id order by id) r));
 result:=result||jsonb_build_object('staff',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select id,cart_id,name,mobile,active,is_manager,updated_at from staff where s.role='admin' or cart_id=s.cart_id order by id) r));
 result:=result||jsonb_build_object('carts',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select id,name,tagline,cuisine,location,timing,emoji,accent,logo,phone,instagram,upi_id,upi_qr,open_time,close_time,closed_manually,default_prep_mins,owner_name,owner_mobile,active,created_at from carts where s.role='admin' or id=s.cart_id order by id) r));
 return result;
end $$;
revoke all on function public.app_partner_bootstrap() from public,anon,authenticated;
grant execute on function public.app_partner_bootstrap() to anon;
create index if not exists orders_cart_date_id on public.orders(cart_id,date,id);

create table public.partner_notifications (
 id bigint generated always as identity primary key,
 cart_id text not null references public.carts(id),
 audience text not null check(audience in ('owner','staff')),
 event_key text not null unique,
 kind text not null, title text not null, body text not null,
 target text not null, business_date date, created_at timestamptz not null default now()
);
create index partner_notifications_cart_recent on public.partner_notifications(cart_id,audience,id desc);
create table app_private.partner_notification_reads (
 notification_id bigint references public.partner_notifications(id) on delete cascade,
 principal text not null, read_at timestamptz not null default now(), primary key(notification_id,principal)
);
create table app_private.partner_notification_deliveries (
 notification_id bigint references public.partner_notifications(id) on delete cascade,
 endpoint text not null, lease uuid, retry_at timestamptz not null default now(),
 sent_at timestamptz, attempts integer not null default 0, primary key(notification_id,endpoint)
);
alter table public.partner_notifications enable row level security;
alter table app_private.partner_notification_reads enable row level security;
alter table app_private.partner_notification_deliveries enable row level security;
revoke all on public.partner_notifications,app_private.partner_notification_reads,app_private.partner_notification_deliveries from public,anon,authenticated;

create function app_private.partner_event() returns trigger language plpgsql security definer set search_path=public,app_private as $$
declare j jsonb:=to_jsonb(new); oldj jsonb; k text; title text; body text; target text; d date; key text;
begin
 if tg_op='UPDATE' then oldj:=to_jsonb(old); end if;
 d:=coalesce(j->>'business_date',j->>'date')::date;
 if tg_table_name='orders' then
  target:='orders';
  if tg_op='INSERT' then k:='order';title:='Order logged';
  elsif j->>'payment'='cancelled' and oldj->>'payment' is distinct from 'cancelled' then k:='cancel';title:='Order cancelled';
  elsif j->>'payment' is distinct from oldj->>'payment' then k:='payment';title:='Order payment updated';
  else return new; end if;
  body:=coalesce(j->>'staff','Team')||' · Order #'||coalesce(j->>'token',j->>'id')||' · ₹'||coalesce(j->>'total','0')||' · '||coalesce(j->>'payment','')||case when k='cancel' then ' · '||coalesce(j->>'cancel_reason','') else '' end;
  key:=k||':'||(j->>'id')||':'||coalesce(j->>'revision','0');
 elsif tg_table_name='opening_loads' then
  k:='opening';title:='Opening stock submitted';target:='stock';body:=coalesce(j->>'actor_name','Manager')||' · '||(j->>'business_date')||' · '||coalesce(j->>'quantities','{}');key:='opening:'||(j->>'cart_id')||':'||(j->>'business_date');
 elsif tg_table_name='cart_loadings' then
  if j->>'type'<>'CART_LOAD' or j->>'note'='Opening stock transfer' then return new; end if;
  k:='refill';title:='Stock refilled';target:='stock';body:=coalesce(j->>'item','Stock')||' · +'||coalesce(j->>'qty','0')||' pieces · '||coalesce(j->>'note','');key:='refill:'||(j->>'cart_id')||':'||(j->>'id');
 elsif tg_table_name='closing_reports' then
  if j->>'submitted_at' is null or oldj->>'submitted_at' is not null then return new; end if;
  k:='closing';title:='Closing report submitted';target:='closing';body:=coalesce(j->>'submitted_name','Manager')||' · Cash ₹'||coalesce(j->>'cash_count','0')||' · Review remaining stock';key:='closing:'||(j->>'id');
 elsif tg_table_name='opening_alerts' then
  if j->>'kind'<>'missed' then return new; end if;
  k:='opening_missed';title:=j->>'title';body:=j->>'body';target:='stock';key:='opening-alert:'||(j->>'id');
 elsif tg_table_name='day_close_logs' then
  k:='reconciliation';title:='Daily reconciliation saved';target:='closing';body:='Cash and stock report saved for '||(j->>'date');key:='reconciliation:'||(j->>'cart_id')||':'||(j->>'id');
 else return new; end if;
 insert into partner_notifications(cart_id,audience,event_key,kind,title,body,target,business_date)
 values(j->>'cart_id','owner',key,k,title,body,target,d) on conflict(event_key) do nothing;
 return new;
end $$;
revoke all on function app_private.partner_event() from public,anon,authenticated;
create trigger partner_order_event after insert or update on public.orders for each row execute function app_private.partner_event();
create trigger partner_opening_event after insert on public.opening_loads for each row execute function app_private.partner_event();
create trigger partner_refill_event after insert on public.cart_loadings for each row execute function app_private.partner_event();
create trigger partner_closing_event after insert or update on public.closing_reports for each row execute function app_private.partner_event();
create trigger partner_missed_opening_event after insert on public.opening_alerts for each row execute function app_private.partner_event();
create trigger partner_reconciliation_event after insert on public.day_close_logs for each row execute function app_private.partner_event();

create function public.app_partner_inbox(p_cart_id text,p_before bigint default null) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); who text; result jsonb; unread integer;
begin
 if not app_private.allowed(p_cart_id) then raise exception 'Not authorised' using errcode='42501'; end if;
 who:=s.role||':'||p_cart_id||':'||coalesce(s.staff_id::text,'owner');
 select count(*) into unread from partner_notifications n where n.cart_id=p_cart_id and n.audience=case when s.role='staff' then 'staff' else 'owner' end and not exists(select 1 from app_private.partner_notification_reads r where r.notification_id=n.id and r.principal=who);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
 select n.*, exists(select 1 from app_private.partner_notification_reads r where r.notification_id=n.id and r.principal=who) as is_read
 from partner_notifications n where n.cart_id=p_cart_id and n.audience=case when s.role='staff' then 'staff' else 'owner' end and (p_before is null or n.id<p_before) order by n.id desc limit 30) q;
 return jsonb_build_object('items',result,'unread',unread);
end $$;
create function public.app_read_partner_notification(p_id bigint) returns void
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); n partner_notifications;
begin
 select * into n from partner_notifications where id=p_id;
 if not found or not app_private.allowed(n.cart_id) or n.audience<>(case when s.role='staff' then 'staff' else 'owner' end) then raise exception 'Not authorised' using errcode='42501'; end if;
 insert into app_private.partner_notification_reads(notification_id,principal) values(p_id,s.role||':'||n.cart_id||':'||coalesce(s.staff_id::text,'owner')) on conflict do nothing;
end $$;
create function public.app_publish_announcement(p_cart_id text,p_operation_id uuid,p_title text,p_body text) returns bigint
language plpgsql security definer set search_path=public,app_private as $$
declare result bigint;
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_operation_id is null or length(trim(p_title)) not between 1 and 100 or length(trim(p_body)) not between 1 and 2000 then raise exception 'Enter a title (up to 100) and message (up to 2000 characters)'; end if;
 insert into partner_notifications(cart_id,audience,event_key,kind,title,body,target,business_date) values(p_cart_id,'staff','announcement:'||p_cart_id||':'||p_operation_id,'announcement',trim(p_title),trim(p_body),'inbox',(now() at time zone 'Asia/Kolkata')::date) on conflict(event_key) do nothing;
 insert into partner_notifications(cart_id,audience,event_key,kind,title,body,target,business_date) values(p_cart_id,'owner','announcement-owner:'||p_cart_id||':'||p_operation_id,'announcement','Announcement published: '||trim(p_title),trim(p_body),'inbox',(now() at time zone 'Asia/Kolkata')::date) on conflict(event_key) do nothing;
 select id into result from partner_notifications where event_key='announcement:'||p_cart_id||':'||p_operation_id;
 return result;
end $$;
revoke all on function public.app_partner_inbox(text,bigint), public.app_read_partner_notification(bigint),public.app_publish_announcement(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.app_partner_inbox(text,bigint), public.app_read_partner_notification(bigint),public.app_publish_announcement(text,uuid,text,text) to anon;

create function public.app_claim_partner_notifications() returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 insert into app_private.partner_notification_deliveries(notification_id,endpoint)
 select n.id,s.endpoint from partner_notifications n join push_subscriptions s on s.cart_id=n.cart_id and s.role=n.audience
 where n.created_at>now()-interval '1 day' and n.kind not in ('opening','closing','opening_missed') on conflict do nothing;
 with due as (
 select d.notification_id,d.endpoint from app_private.partner_notification_deliveries d join partner_notifications n on n.id=d.notification_id join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=n.cart_id and s.role=n.audience
 where d.sent_at is null and d.retry_at<=now() and n.created_at>now()-interval '1 day' order by d.notification_id limit 50 for update of d skip locked
 ), claimed as (
 update app_private.partner_notification_deliveries d set lease=gen_random_uuid(),retry_at=now()+interval '2 minutes',attempts=attempts+1 from due where d.notification_id=due.notification_id and d.endpoint=due.endpoint returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'lease',d.lease,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'title',n.title,'body',n.body,'cartId',n.cart_id,'date',n.business_date,'tag','inbox-'||n.id,'mode','info')),'[]'::jsonb) into result
 from claimed d join partner_notifications n on n.id=d.notification_id join push_subscriptions s on s.endpoint=d.endpoint;
 return result;
end $$;
create function public.app_finish_partner_notification(p_id bigint,p_endpoint text,p_lease uuid,p_sent boolean,p_dead boolean default false) returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 update app_private.partner_notification_deliveries set sent_at=case when p_sent or p_dead then now() else null end,retry_at=now()+least(attempts,30)*interval '1 minute',lease=null where notification_id=p_id and endpoint=p_endpoint and lease=p_lease;
 if found and p_dead then delete from push_subscriptions where endpoint=p_endpoint; end if;
end $$;
revoke all on function public.app_claim_partner_notifications(),public.app_finish_partner_notification(bigint,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.app_claim_partner_notifications(),public.app_finish_partner_notification(bigint,text,uuid,boolean,boolean) to anon;
commit;
