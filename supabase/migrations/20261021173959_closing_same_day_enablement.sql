create or replace function app_private.collect_closing_reports(p_now timestamptz,p_cart text default null)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare c record; d date; due timestamptz; items jsonb;
begin
 for c in select s.* from cart_closing_settings s join carts cart on cart.id=s.cart_id and cart.active where s.enabled and (p_cart is null or s.cart_id=p_cart) loop
  -- Include the configuration day even when enabled after the scheduled hour.
  -- Do not create historical reports for dates before enablement/update.
  for d in select (p_now at time zone 'Asia/Kolkata')::date-i from generate_series(0,1) i loop
   due:=(d+c.closing_time) at time zone 'Asia/Kolkata';
   if due>p_now or d<(c.updated_at at time zone 'Asia/Kolkata')::date then continue; end if;
   select coalesce(data->c.cart_id->'stockTypes','[]'::jsonb) into items from menus where id=1;
   insert into closing_reports(cart_id,business_date,due_at,stock_types) values(c.cart_id,d,due,coalesce(items,'[]')) on conflict do nothing;
  end loop;
 end loop;
end $$;
