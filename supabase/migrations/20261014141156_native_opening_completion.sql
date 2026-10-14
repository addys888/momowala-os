create or replace function public.app_claim_opening_notifications()
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 perform app_private.collect_opening_alerts(now());
 insert into app_private.opening_deliveries(alert_id,endpoint)
 select a.id,s.endpoint from opening_alerts a join push_subscriptions s on s.cart_id=a.cart_id
 where a.created_at>now()-interval '1 day' and
 (((a.kind<>'manager_reminder' and s.role='owner') or (a.kind='completed' and s.endpoint like 'fcm:%' and s.role='staff' and s.staff_id=a.staff_id)) or (a.kind='manager_reminder' and s.role='staff' and s.staff_id=a.staff_id))
 on conflict do nothing;
 with due as (
  select d.alert_id,d.endpoint from app_private.opening_deliveries d
  join opening_alerts a on a.id=d.alert_id join carts c on c.id=a.cart_id and c.active join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=a.cart_id
  where d.sent_at is null and d.retry_at<=now() and a.created_at>now()-interval '1 day'
  and (((a.kind<>'manager_reminder' and s.role='owner') or (a.kind='completed' and s.endpoint like 'fcm:%' and s.role='staff' and s.staff_id=a.staff_id)) or
   (a.kind='manager_reminder' and s.role='staff' and s.staff_id=a.staff_id
    and c.open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and now() < ((a.business_date+c.open_time::time) at time zone 'Asia/Kolkata')
    and exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.active where m.cart_id=a.cart_id and m.staff_id=a.staff_id)
    and not exists(select 1 from opening_loads l where l.cart_id=a.cart_id and l.business_date=a.business_date)))
  order by a.id limit 20 for update of d skip locked
 ), claimed as (
  update app_private.opening_deliveries d set lease=gen_random_uuid(),retry_at=now()+interval '2 minutes',attempts=attempts+1
  from due where d.alert_id=due.alert_id and d.endpoint=due.endpoint returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'lease',d.lease,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'title',a.title,'body',a.body,'kind',a.kind,'cartId',a.cart_id,'date',a.business_date,'mode',case when a.kind='completed' and s.role='staff' then 'stock_complete' else 'alert' end)), '[]') into result
 from claimed d join opening_alerts a on a.id=d.alert_id join push_subscriptions s on s.endpoint=d.endpoint;
 return result;
end $$;


revoke all on function public.app_claim_opening_notifications() from public,authenticated;
grant execute on function public.app_claim_opening_notifications() to anon;
notify pgrst,'reload schema';
