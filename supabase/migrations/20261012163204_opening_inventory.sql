create sequence if not exists app_private.opening_log_id increment -1 minvalue -9007199254740991 maxvalue -1 start -1;
-- Staged: opening stock is one atomic, idempotent transfer, not independent log + delta writes.
create table if not exists public.opening_loads (
 cart_id text not null references public.carts(id), business_date date not null,
 operation_id uuid not null unique, quantities jsonb not null,
 actor_role text not null, actor_name text, created_at timestamptz not null default now(),
 primary key(cart_id,business_date)
);
alter table public.opening_loads enable row level security;
revoke all on public.opening_loads from public,anon,authenticated;
grant select on public.opening_loads to anon;
drop policy if exists scoped_read on public.opening_loads;
create policy scoped_read on public.opening_loads for select to anon using(app_private.allowed(cart_id));
create or replace function public.app_load_opening_inventory(p_cart_id text,p_date date,p_operation_id uuid,p_quantities jsonb)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); existing opening_loads; blob jsonb; ci jsonb; k text; qty jsonb; n numeric; f numeric; c numeric; today date:=(now() at time zone 'Asia/Kolkata')::date; tomorrow_open timestamp; expected_date date;
begin
 if not app_private.allowed(p_cart_id,array['admin','owner','staff']) then raise exception 'Not authorised' using errcode='42501'; end if;
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
 return jsonb_build_object('status','ok','record',to_jsonb(existing),'cartInv',ci);
end $$;
revoke all on function public.app_load_opening_inventory(text,date,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.app_load_opening_inventory(text,date,uuid,jsonb) to anon;
notify pgrst,'reload schema';
