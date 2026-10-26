begin;
-- Routine order activity belongs in Orders, not the operational inbox.
-- Retain historical notification rows and all business records.
drop trigger if exists partner_order_event on public.orders;

create or replace function public.app_partner_inbox(p_cart_id text,p_before bigint default null) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); who text; result jsonb; unread integer;
begin
 if not app_private.allowed(p_cart_id) then raise exception 'Not authorised' using errcode='42501'; end if;
 who:=s.role||':'||p_cart_id||':'||coalesce(s.staff_id::text,'owner');
 select count(*) into unread from partner_notifications n where n.kind not in ('order','cancel','payment') and n.cart_id=p_cart_id and n.audience=case when s.role='staff' then 'staff' else 'owner' end and not exists(select 1 from app_private.partner_notification_reads r where r.notification_id=n.id and r.principal=who);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
 select n.*, exists(select 1 from app_private.partner_notification_reads r where r.notification_id=n.id and r.principal=who) as is_read
 from partner_notifications n where n.kind not in ('order','cancel','payment') and n.cart_id=p_cart_id and n.audience=case when s.role='staff' then 'staff' else 'owner' end and (p_before is null or n.id<p_before) order by n.id desc limit 30) q;
 return jsonb_build_object('items',result,'unread',unread);
end $$;

create or replace function public.app_claim_partner_notifications() returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 insert into app_private.partner_notification_deliveries(notification_id,endpoint)
 select n.id,s.endpoint from partner_notifications n join push_subscriptions s on s.cart_id=n.cart_id and s.role=n.audience
 where n.created_at>now()-interval '1 day' and n.kind not in ('opening','closing','opening_missed','order','cancel','payment') on conflict do nothing;
 with due as (
 select d.notification_id,d.endpoint from app_private.partner_notification_deliveries d join partner_notifications n on n.id=d.notification_id join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=n.cart_id and s.role=n.audience
 where n.kind not in ('order','cancel','payment') and d.sent_at is null and d.retry_at<=now() and n.created_at>now()-interval '1 day' order by d.notification_id limit 50 for update of d skip locked
 ), claimed as (
 update app_private.partner_notification_deliveries d set lease=gen_random_uuid(),retry_at=now()+interval '2 minutes',attempts=attempts+1 from due where d.notification_id=due.notification_id and d.endpoint=due.endpoint returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'lease',d.lease,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'title',n.title,'body',n.body,'cartId',n.cart_id,'date',n.business_date,'tag','inbox-'||n.id,'mode','info')),'[]'::jsonb) into result
 from claimed d join partner_notifications n on n.id=d.notification_id join push_subscriptions s on s.endpoint=d.endpoint;
 return result;
end $$;
commit;
