-- Manager identity is derived from the single authoritative assignment, never a client flag.
alter table public.staff add column if not exists is_manager boolean not null default false;
create or replace function app_private.staff_manager_flag() returns trigger
language plpgsql security definer set search_path=public,app_private as $$
begin
 new.is_manager:=new.active and exists(select 1 from cart_opening_managers where cart_id=new.cart_id and staff_id=new.id);
 return new;
end $$;
drop trigger if exists staff_manager_flag on public.staff;
create trigger staff_manager_flag before insert or update on public.staff for each row execute function app_private.staff_manager_flag();
create or replace function app_private.refresh_manager_flags() returns trigger
language plpgsql security definer set search_path=public,app_private as $$
begin
 update staff set is_manager=is_manager where cart_id=coalesce(new.cart_id,old.cart_id);
 return null;
end $$;
drop trigger if exists refresh_manager_flags on public.cart_opening_managers;
create trigger refresh_manager_flags after insert or update or delete on public.cart_opening_managers for each row execute function app_private.refresh_manager_flags();
update public.staff set is_manager=is_manager;
grant select(is_manager) on public.staff to anon;
revoke all on function app_private.staff_manager_flag(),app_private.refresh_manager_flags() from public,anon,authenticated;

-- Match the existing 30-minute preparation window for carts opening just after midnight.
create or replace function app_private.stock_business_date(p_cart text,p_now timestamptz default now()) returns date
language sql stable security definer set search_path=public,app_private as $$
 select case when (p_now at time zone 'Asia/Kolkata') >= ((p_now at time zone 'Asia/Kolkata')::date+1+coalesce(nullif(c.open_time,''),'16:00')::time)-interval '30 minutes'
 then (p_now at time zone 'Asia/Kolkata')::date+1 else (p_now at time zone 'Asia/Kolkata')::date end from carts c where c.id=p_cart;
$$;
create table if not exists app_private.inventory_days(cart_id text primary key references public.carts(id),business_date date not null);
alter table app_private.inventory_days enable row level security;
create table if not exists public.cart_stock_rollovers(
 cart_id text not null references public.carts(id),business_date date not null,next_business_date date not null,
 quantities jsonb not null,reset_at timestamptz not null default now(),primary key(cart_id,business_date)
);
alter table public.cart_stock_rollovers enable row level security;
revoke all on app_private.inventory_days,public.cart_stock_rollovers from public,anon,authenticated;
grant select on public.cart_stock_rollovers to anon;
drop policy if exists scoped_read on public.cart_stock_rollovers;
create policy scoped_read on public.cart_stock_rollovers for select to anon using(app_private.allowed(cart_id,array['owner','admin']));
-- Preserve today's live inventory at rollout; automatic resets begin on the next business day.
insert into app_private.inventory_days select id,app_private.stock_business_date(id) from public.carts on conflict(cart_id) do nothing;
create or replace function app_private.roll_stock_day(p_cart text) returns void
language plpgsql security definer set search_path=public,app_private as $$
declare d date:=app_private.stock_business_date(p_cart); previous date; blob jsonb; ci jsonb; k text; v jsonb; counts jsonb:='{}';
begin
 if d is null then return; end if;
 -- Fast read path, then recheck under the same inventory row lock used by every stock mutation.
 select business_date into previous from app_private.inventory_days where cart_id=p_cart;
 if previous>=d then return; end if;
 select data into blob from inventory where id=1 for update;
 if not found then return; end if;
 select business_date into previous from app_private.inventory_days where cart_id=p_cart;
 if previous>=d then return; end if;
 if previous is not null then
  ci:=coalesce(blob->p_cart,'{}');
  for k,v in select * from jsonb_each(ci) loop
   if k<>'consumables' and jsonb_typeof(v)='object' and v ? 'cart' then
    counts:=counts||jsonb_build_object(k,v->'cart');
    ci:=jsonb_set(ci,array[k,'cart'],'0'::jsonb);
   end if;
  end loop;
  insert into cart_stock_rollovers(cart_id,business_date,next_business_date,quantities) values(p_cart,previous,d,counts) on conflict do nothing;
  update inventory set data=jsonb_set(blob,array[p_cart],ci,true),updated_at=now() where id=1;
 end if;
 insert into app_private.inventory_days values(p_cart,d) on conflict(cart_id) do update set business_date=excluded.business_date;
end $$;
create or replace function app_private.roll_all_stock_days() returns void
language plpgsql security definer set search_path=public,app_private as $$
declare cid text;
begin
 for cid in select id from carts order by id loop perform app_private.roll_stock_day(cid); end loop;
end $$;
create or replace function public.app_inventory() returns jsonb
language plpgsql volatile security definer set search_path=public,app_private as $$
declare cid text;
begin
 for cid in select id from carts where app_private.allowed(id) order by id loop perform app_private.roll_stock_day(cid); end loop;
 return coalesce((select jsonb_object_agg(e.key,e.value) from inventory i,jsonb_each(i.data) e where app_private.allowed(e.key)),'{}'::jsonb);
end $$;
revoke all on function app_private.stock_business_date(text,timestamptz),app_private.roll_stock_day(text),app_private.roll_all_stock_days() from public,anon,authenticated;
-- Daily rollover also runs with all phones closed. Reads/writes provide an atomic fallback.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('cartlyft-daily-stock','* * * * *','select app_private.roll_all_stock_days()');
 end if;
end $$;

do $migration$
declare definition text; target text; replacement text;
begin
 definition:=pg_get_functiondef('app_private.inventory_delta(text,jsonb)'::regprocedure);
 target:=' insert into inventory(id,data)';
 if position(target in definition)=0 then raise exception 'inventory_delta integration point missing'; end if;
 definition:=replace(definition,target,E' perform app_private.roll_stock_day(p_cart);\n'||target);
 execute definition;
 definition:=pg_get_functiondef('public.app_load_opening_inventory(text,date,uuid,jsonb)'::regprocedure);
 target:=' select data into blob from inventory where id=1 for update;';
 if position(target in definition)=0 then raise exception 'opening integration point missing'; end if;
 execute replace(definition,target,E' perform app_private.roll_stock_day(p_cart_id);\n'||target);
 definition:=pg_get_functiondef('public.app_mutate_batch(uuid,jsonb)'::regprocedure);
 target:='   select data->cid into inv from inventory where id=1 for update;';
 if position(target in definition)=0 then raise exception 'batch integration point missing'; end if;
 execute replace(definition,target,E'   perform app_private.roll_stock_day(cid);\n'||target);
end $migration$;

-- Attribute deductions to the stock day so cancelling old orders cannot resurrect yesterday's food.
alter table public.orders add column if not exists stock_business_date date;
update public.orders set stock_business_date=date where stock_deducted and stock_business_date is null;
do $migration$
declare definition text; target text;
begin
 definition:=pg_get_functiondef('app_private.write_order(jsonb)'::regprocedure);
 target:='   newrow.items:=app_private.price_items(cid,a->''items'');';
 if position(target in definition)=0 then raise exception 'order edit integration point missing'; end if;
 definition:=replace(definition,target,E'   if old.stock_deducted and old.stock_business_date is distinct from app_private.stock_business_date(cid) then raise exception ''Start a new order for today’s items; this order belongs to an earlier stock day.''; end if;\n'||target);
 target:=' perform app_private.inventory_delta(cid,ops);';
 if position(target in definition)=0 then raise exception 'order stock integration point missing'; end if;
 definition:=replace(definition,target,E' if coalesce(old.stock_deducted,false) and old.stock_business_date is distinct from app_private.stock_business_date(cid) then ops:=''{}''; end if;\n newrow.stock_business_date:=case when newrow.stock_deducted and not coalesce(old.stock_deducted,false) then app_private.stock_business_date(cid) else old.stock_business_date end;\n'||target);
 target:='stock_deducted=newrow.stock_deducted,stock_usage=newrow.stock_usage';
 if position(target in definition)=0 then raise exception 'order date integration point missing'; end if;
 definition:=replace(definition,target,'stock_business_date=newrow.stock_business_date,'||target);
 execute definition;
end $migration$;

create or replace function public.app_opening_status(p_cart_id text,p_date date) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); m record; assignment cart_opening_managers; r opening_loads; d date;
begin
 if not app_private.allowed(p_cart_id) then raise exception 'Not authorised' using errcode='42501'; end if;
 d:=app_private.stock_business_date(p_cart_id);
 perform app_private.roll_stock_day(p_cart_id);
 select * into assignment from cart_opening_managers where cart_id=p_cart_id;
 select id,name,active into m from staff where id=assignment.staff_id and cart_id=p_cart_id;
 select * into r from opening_loads where cart_id=p_cart_id and business_date=coalesce(p_date,d);
 return jsonb_build_object('businessDate',d,'record',case when r.cart_id is null then null else to_jsonb(r) end,
 'managerId',assignment.staff_id,'managerName',m.name,'managerActive',coalesce(m.active,false),'revision',coalesce(assignment.revision,0),
 'isManager',coalesce(s.role='staff' and s.staff_id=m.id and m.active,false),
 'canLoad',coalesce(s.role='staff' and s.staff_id=m.id and m.active,false));
end $$;
notify pgrst,'reload schema';
