begin;
create table if not exists app_private.stock_refills (
 operation_id uuid primary key,cart_id text not null references public.carts(id),business_date date not null,
 staff_id bigint not null references public.staff(id),category text not null,quantity integer not null check(quantity>0),
 log_id bigint not null,created_at timestamptz not null default now()
);
alter table app_private.stock_refills enable row level security;
revoke all on app_private.stock_refills from public,anon,authenticated;
create or replace function public.app_refill_stock(p_cart_id text,p_date date,p_operation_id uuid,p_category text,p_quantity integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare s app_sessions:=app_private.session();prior app_private.stock_refills;blob jsonb;ci jsonb;f numeric;c numeric;logid bigint;
begin
 if not app_private.allowed(p_cart_id,array['staff']) then raise exception 'Only the assigned manager can refill stock' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 if not exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active where m.cart_id=p_cart_id and m.staff_id=s.staff_id) then raise exception 'Only the assigned active manager can refill stock' using errcode='42501'; end if;
 perform 1 from staff where id=s.staff_id and active for share;
 if not found then raise exception 'Manager account is inactive' using errcode='42501'; end if;
 if p_operation_id is null then raise exception 'Refill reference required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,92));
 select * into prior from app_private.stock_refills where operation_id=p_operation_id;
 if found then
  if prior.cart_id is distinct from p_cart_id or prior.staff_id is distinct from s.staff_id or prior.business_date is distinct from p_date or prior.category is distinct from p_category or prior.quantity is distinct from p_quantity then raise exception 'Refill reference already used for another request'; end if;
  return jsonb_build_object('status','ok','record',to_jsonb(prior));
 end if;
 if p_date is distinct from app_private.stock_business_date(p_cart_id) then raise exception 'Reload before refilling a new business day'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id||':'||p_date::text,2));
 if not exists(select 1 from opening_loads where cart_id=p_cart_id and business_date=p_date) then raise exception 'Submit today''s opening stock before refilling'; end if;
 if p_category is null or p_quantity is null or p_quantity<=0 or p_quantity>100000 then raise exception 'Choose a category and positive whole-piece quantity'; end if;
 if not exists(select 1 from menus m cross join lateral jsonb_array_elements(coalesce(m.data->p_cart_id->'stockTypes','[]')) t where m.id=1 and t->>'key'=p_category) then raise exception 'Unknown stock category'; end if;
 perform app_private.roll_stock_day(p_cart_id);
 select data into blob from inventory where id=1 for update;
 ci:=blob->p_cart_id;
 if ci is null or not ci ? p_category or p_category='consumables' then raise exception 'Stock category is unavailable'; end if;
 f:=coalesce((ci->p_category->>'freezer')::numeric,0);c:=coalesce((ci->p_category->>'cart')::numeric,0);
 if p_quantity>f then raise exception 'Not enough freezer stock for this refill'; end if;
 ci:=jsonb_set(ci,array[p_category],(ci->p_category)||jsonb_build_object('freezer',f-p_quantity,'cart',c+p_quantity));
 update inventory set data=jsonb_set(blob,array[p_cart_id],ci,true),updated_at=now() where id=1;
 logid:=nextval('app_private.opening_log_id');
 insert into cart_loadings(id,cart_id,date,time,type,item,qty,note) values(logid,p_cart_id,p_date,to_char(now() at time zone 'Asia/Kolkata','HH24:MI'),'CART_LOAD',p_category,p_quantity,'Manager refill · '||coalesce(s.name,'manager'));
 insert into app_private.stock_refills(operation_id,cart_id,business_date,staff_id,category,quantity,log_id) values(p_operation_id,p_cart_id,p_date,s.staff_id,p_category,p_quantity,logid) returning * into prior;
 return jsonb_build_object('status','ok','record',to_jsonb(prior));
end $$;
revoke all on function public.app_refill_stock(text,date,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.app_refill_stock(text,date,uuid,text,integer) to anon;
notify pgrst,'reload schema';
commit;
