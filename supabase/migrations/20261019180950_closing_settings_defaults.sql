-- A missing composite row serializes as an object with null fields, not SQL NULL.
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
 return jsonb_build_object('settings',case when cfg.cart_id is null then jsonb_build_object('enabled',false,'closing_time','22:00:00','revision',0) else to_jsonb(cfg) end, 'canSubmit',manager,'managerRevision',(select revision from cart_opening_managers where cart_id=p_cart_id),'reports',reports,'serverNow',now());
end $$;

notify pgrst,'reload schema';
