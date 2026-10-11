-- Preserve existing records and passwords. All browser writes now use checked,
-- idempotent commands; old builds cannot overwrite newer data via table upserts.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;
create table if not exists app_private.operations (
  id uuid primary key, actor text not null, result jsonb, created_at timestamptz default now()
);
create table if not exists app_private.backend_config (id int primary key check(id=1), secret_hash text not null);
create table if not exists app_private.login_attempts (mobile text primary key, attempts int not null, since timestamptz not null);
alter table app_sessions add column if not exists staff_id bigint;
alter table orders add column if not exists customer_key uuid;
alter table orders add column if not exists revision bigint not null default 0;
alter table orders add column if not exists stock_deducted boolean;
alter table orders add column if not exists stock_usage jsonb;
alter table orders add column if not exists notified_at timestamptz;
create index if not exists orders_customer_key_idx on orders(customer_key);
create index if not exists orders_cart_date_idx on orders(cart_id,date);

create or replace function app_session(p_token uuid)
returns app_sessions language sql stable security definer set search_path=public,extensions as $$
  select s.* from app_sessions s where s.token=p_token and s.expires_at>now()
    and (s.role='admin' or exists(select 1 from carts c where c.id=s.cart_id and c.active))
    and (s.role<>'staff' or exists(select 1 from staff t where t.cart_id=s.cart_id and t.active
      and (t.id=s.staff_id or (s.staff_id is null and t.name=s.name))));
$$;
create or replace function app_private.header(p_name text) returns text
language sql stable set search_path=pg_catalog as $$
  select coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>p_name;
$$;
create or replace function app_private.session() returns public.app_sessions
language plpgsql stable security definer set search_path=public,app_private as $$
begin return public.app_session(nullif(app_private.header('x-app-session'),'')::uuid);
exception when invalid_text_representation then return null; end;
$$;
create or replace function app_private.customer() returns uuid
language plpgsql stable set search_path=pg_catalog,app_private as $$
begin return nullif(app_private.header('x-customer-key'),'')::uuid;
exception when invalid_text_representation then return null; end;
$$;
create or replace function app_private.backend() returns boolean
language sql stable security definer set search_path=public,extensions,app_private as $$
 select coalesce((select secret_hash=encode(digest(app_private.header('x-backend-secret'),'sha256'),'hex') from app_private.backend_config where id=1),false);
$$;
create or replace function app_private.allowed(p_cart text, p_roles text[] default array['admin','owner','staff']) returns boolean
language sql stable security definer set search_path=public,app_private as $$
 select coalesce(s.role=any(p_roles) and (s.role='admin' or s.cart_id=p_cart),false) from app_private.session() s;
$$;
create or replace function app_identity() returns jsonb
language sql stable security definer set search_path=public,app_private as $$
 select jsonb_build_object('role',s.role,'cartId',s.cart_id,'name',s.name,'expiresAt',extract(epoch from s.expires_at)*1000) from app_private.session() s;
$$;
create or replace function app_logout() returns void
language sql security definer set search_path=public,app_private as $$
 delete from app_sessions where token=(app_private.session()).token;
$$;
-- No public first-claim path. The authenticated admin provisions owner passwords.
create or replace function app_set_password(p_role text,p_mobile text,p_cart_id text,p_password text)
returns json language sql security definer set search_path=public as $$
 select json_build_object('status','error','message','Ask the platform admin to set your initial password.');
$$;
create or replace function app_login(p_mobile text,p_password text,p_context text default 'team')
returns json language plpgsql security definer set search_path=public,extensions,app_private as $$
declare r record; tok uuid; exp timestamptz:=now()+interval '24 hours'; n int; h text;
begin
 if p_password is null or length(p_password)<4 or length(p_password)>200 then return json_build_object('status','wrong_password'); end if;
 insert into app_private.login_attempts values(p_mobile,1,now()) on conflict(mobile) do update
 set attempts=case when login_attempts.since<now()-interval '15 minutes' then 1 else login_attempts.attempts+1 end,
 since=case when login_attempts.since<now()-interval '15 minutes' then now() else login_attempts.since end returning attempts into n;
 if n>20 then return json_build_object('status','error','message','Too many attempts. Try again in 15 minutes.'); end if;
 if p_context='admin' then
  select admin_password_hash into h from platform where id=1 and admin_mobile=p_mobile;
  if h is null or h<>app_hash(p_password) then return json_build_object('status','wrong_password'); end if;
  insert into app_sessions(role,expires_at) values('admin',exp) returning token into tok;
  delete from app_private.login_attempts where mobile=p_mobile;
  return json_build_object('status','ok','role','admin','token',tok,'expiresAt',extract(epoch from exp)*1000);
 end if;
 select id,owner_password_hash into r from carts where owner_mobile=p_mobile and active limit 1;
 if found then
  if r.owner_password_hash is null then return json_build_object('status','error','message','Ask the platform admin to set your initial password.'); end if;
  if r.owner_password_hash<>app_hash(p_password) then return json_build_object('status','wrong_password'); end if;
  insert into app_sessions(role,cart_id,expires_at) values('owner',r.id,exp) returning token into tok;
  delete from app_private.login_attempts where mobile=p_mobile;
  return json_build_object('status','ok','role','owner','cart_id',r.id,'token',tok,'expiresAt',extract(epoch from exp)*1000);
 end if;
 select t.* into r from staff t join carts c on c.id=t.cart_id where t.mobile=p_mobile and t.active and c.active limit 1;
 if not found or r.password_hash is null or r.password_hash<>app_hash(p_password) then return json_build_object('status','wrong_password'); end if;
 insert into app_sessions(role,cart_id,name,staff_id,expires_at) values('staff',r.cart_id,r.name,r.id,exp) returning token into tok;
 delete from app_private.login_attempts where mobile=p_mobile;
 return json_build_object('status','ok','role','staff','cart_id',r.cart_id,'name',r.name,'token',tok,'expiresAt',extract(epoch from exp)*1000);
end $$;

-- Public catalog contains no account identifiers, credentials, or inventory.
create or replace function app_catalog() returns jsonb
language sql stable security definer set search_path=public,app_private as $$
 select jsonb_build_object('carts',coalesce((select jsonb_agg(to_jsonb(c)-'owner_password_hash'-'owner_mobile'-'owner_name') from carts c where c.active),'[]'::jsonb),
 'menus',coalesce((select jsonb_object_agg(e.key,e.value-'printer') from menus m,jsonb_each(m.data) e join carts c on c.id=e.key where c.active),'{}'::jsonb));
$$;
create or replace function app_inventory() returns jsonb
language sql stable security definer set search_path=public,app_private as $$
 select coalesce((select jsonb_object_agg(e.key,e.value) from inventory i,jsonb_each(i.data) e where app_private.allowed(e.key)),'{}'::jsonb);
$$;

-- Canonical prices and stock requirements are derived from the server menu.
create or replace function app_private.price_items(p_cart text,p_items jsonb) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare menu jsonb; item jsonb; m jsonb; result jsonb:='[]'; portion text; qty int; price int; pcs int; sk text;
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid items'; end if;
 select data->p_cart into menu from menus where id=1;
 for item in select value from jsonb_array_elements(p_items) loop
  qty:=(item->>'qty')::int;
  if qty is null or qty not between 1 and 100 then raise exception 'Invalid quantity'; end if;
  select value into m from jsonb_array_elements(coalesce(menu->'items','[]')) where value->>'id'=item->>'id' and (value->>'name'=item->>'name' or (value->>'name') || case when item->>'type'='half' then ' Half' else ' Full' end = item->>'name') limit 1;
  sk:=null; pcs:=0;
  if m is not null then
   portion:=coalesce(item->>'type','full');
   if portion not in ('half','full') then raise exception 'Invalid portion'; end if;
   price:=(m->>portion)::int;
   if price is null or price<=0 then raise exception 'Item is unavailable'; end if;
   sk:=m->>'stockKey'; pcs:=coalesce((m->>(case when portion='half' then 'pcsHalf' else 'pcsFull' end))::int,0);
  else
   select value into m from jsonb_array_elements(coalesce(menu->'lassi','[]')||coalesce(menu->'addons','[]')) where value->>'id'=item->>'id' and value->>'name'=item->>'name' limit 1;
   if m is null then raise exception 'Item is no longer on the menu'; end if;
   price:=(m->>'price')::int; portion:=null;
  end if;
  if price is distinct from (item->>'price')::int then raise exception 'Menu price changed. Refresh before ordering.'; end if;
  result:=result||jsonb_build_array(item||jsonb_build_object('price',price,'qty',qty,'type',portion,'stockKey',sk,'stockPieces',pcs));
 end loop;
 return result;
end $$;
create or replace function app_private.usage(p_cart text,p_items jsonb) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(k,n),'{}'::jsonb) from (
  select coalesce(i->>'stockKey',m->>'stockKey') k,
  sum(coalesce((i->>'stockPieces')::int,(m->>(case when i->>'type'='half' then 'pcsHalf' else 'pcsFull' end))::int,0)*(i->>'qty')::int) n
  from jsonb_array_elements(p_items) i left join lateral
   (select value m from menus,jsonb_array_elements(data->p_cart->'items') where id=1 and value->>'id'=i->>'id' limit 1) x on true
  group by 1
 ) q where k is not null;
$$;
-- Baseline only; no historical stock is changed by the migration.
update orders set stock_deducted=(payment<>'cancelled' and (payment<>'pending' or source='staff-entry')) where stock_deducted is null;
update orders set stock_usage=app_private.usage(cart_id,items) where stock_usage is null;

create or replace function app_private.inventory_delta(p_cart text,p_ops jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare blob jsonb; ci jsonb; k text; op jsonb; f numeric; c numeric;
begin
 insert into inventory(id,data) values(1,'{}') on conflict(id) do nothing;
 select data into blob from inventory where id=1 for update;
 ci:=coalesce(blob->p_cart,'{}');
 for k,op in select * from jsonb_each(p_ops) loop
  f:=greatest(0,coalesce((op->>'fset')::numeric,coalesce((ci->k->>'freezer')::numeric,0)+coalesce((op->>'df')::numeric,0)));
  c:=greatest(0,coalesce((op->>'cset')::numeric,coalesce((ci->k->>'cart')::numeric,0)+coalesce((op->>'dc')::numeric,0)));
  ci:=jsonb_set(ci,array[k],jsonb_build_object('freezer',f,'cart',c),true);
 end loop;
 update inventory set data=jsonb_set(blob,array[p_cart],ci,true),updated_at=now() where id=1;
 return ci;
end $$;

-- One command is one transaction. The row lock prevents two tills settling or
-- cancelling the same order twice. The operation receipt handles lost responses.
create or replace function app_private.write_order(p jsonb) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare old orders; newrow orders; a jsonb:=p->'after'; b jsonb:=p->'before'; s app_sessions:=app_private.session();
 cid text:=a->>'cart_id'; oid bigint:=(a->>'id')::bigint; items2 jsonb; usage2 jsonb; ops jsonb; deducted boolean; k text; v jsonb; customer uuid:=app_private.customer();
begin
 select * into old from orders where id=oid for update;
 if old.id is null then
  if not exists(select 1 from carts where id=cid and active) then raise exception 'Cart unavailable'; end if;
  if a->>'source'='qr-order' then
   if customer is null or a->>'payment'<>'pending' then raise exception 'Not authorised' using errcode='42501'; end if;
   if exists(select 1 from carts where id=cid and closed_manually) then raise exception 'Cart is closed'; end if;
   if length(coalesce(a->>'customer_name',''))<2 or coalesce(a->>'customer_phone','') !~ '^\d{10}$' then raise exception 'Customer details required'; end if;
   perform pg_advisory_xact_lock(hashtextextended(customer::text,0));
   if exists(select 1 from orders where customer_key=customer and inserted_at>now()-interval '20 seconds') then raise exception 'Please wait before ordering again'; end if;
  elsif a->>'source'<>'staff-entry' or not app_private.allowed(cid) then raise exception 'Not authorised' using errcode='42501'; end if;
  items2:=app_private.price_items(cid,a->'items');
  newrow:=jsonb_populate_record(null::orders,a);
  newrow.items:=items2;
  newrow.staff:=case when newrow.source='qr-order' then null when s.role='staff' then s.name else newrow.staff end;
  newrow.total:=(select sum((value->>'price')::int*(value->>'qty')::int) from jsonb_array_elements(items2));
  if newrow.total is distinct from (a->>'total')::int then raise exception 'Invalid total'; end if;
  newrow.token:=lpad(next_order_token(cid,newrow.date)::text,3,'0');
  newrow.customer_key:=case when a->>'source'='qr-order' then customer else null end;
  newrow.inserted_at:=now(); newrow.revision:=1;
  newrow.stock_deducted:=newrow.source='staff-entry';
  newrow.stock_usage:=app_private.usage(cid,items2);
  newrow.settled_at:=case when newrow.payment<>'pending' then now() else null end;
  if newrow.payment not in ('pending','cash','upi','split','zomato','swiggy') then raise exception 'Invalid payment'; end if;
 else
  cid:=old.cart_id;
  if not app_private.allowed(cid) then raise exception 'Not authorised' using errcode='42501'; end if;
  if a->>'cart_id' is distinct from cid then raise exception 'Cannot move orders'; end if;
  -- Compare only edited fields, not unrelated kitchen/acknowledgment changes.
  for k,v in select * from jsonb_each(a-'id'-'cart_id'-'revision') loop
   if v is distinct from b->k and (to_jsonb(old)->k) is distinct from coalesce(b->k,'null'::jsonb) then
    return jsonb_build_object('status','conflict','message','Order changed on another device. Refresh and retry.','order',to_jsonb(old));
   end if;
  end loop;
  newrow:=old;
  if a->'items' is distinct from b->'items' then
   if old.payment<>'pending' then raise exception 'Only unpaid orders can be edited'; end if;
   newrow.items:=app_private.price_items(cid,a->'items');
   newrow.total:=(select sum((value->>'price')::int*(value->>'qty')::int) from jsonb_array_elements(newrow.items));
   newrow.stock_usage:=app_private.usage(cid,newrow.items);
  end if;
  if a->>'payment' is distinct from b->>'payment' then
   if old.payment='cancelled' or (old.payment<>'pending' and a->>'payment'<>'cancelled') then raise exception 'Invalid payment transition'; end if;
   if a->>'payment'='cancelled' then
    if length(coalesce(a->>'cancel_reason',''))=0 then raise exception 'Cancellation reason required'; end if;
    if s.role='staff' and old.payment<>'pending' and (old.source<>'staff-entry' or old.inserted_at<now()-interval '5 minutes') then raise exception 'Cancellation window has ended'; end if;
    newrow.cancel_reason:=a->>'cancel_reason'; newrow.stock_deducted:=false;
   else newrow.stock_deducted:=true;
   end if;
   newrow.payment:=a->>'payment'; newrow.split:=a->'split'; newrow.settled_at:=now(); newrow.staff:=coalesce(s.name,a->>'staff');
  end if;
  if a->'prep_status' is distinct from b->'prep_status' then
   if a->>'prep_status' not in ('preparing','ready') then raise exception 'Invalid preparation status'; end if;
   newrow.prep_status:=a->>'prep_status';
  end if;
  if a->'acknowledged_at' is distinct from b->'acknowledged_at' then newrow.acknowledged_at:=now(); end if;
  newrow.revision:=old.revision+1;
 end if;
 if newrow.payment='split' and (coalesce((newrow.split->>'cash')::int,-1)<0 or coalesce((newrow.split->>'upi')::int,-1)<0 or (newrow.split->>'cash')::int+(newrow.split->>'upi')::int<>newrow.total) then raise exception 'Invalid split payment'; end if;
 -- Apply only the difference in stock accounted for by the persisted order.
 ops:='{}';
 for k in select jsonb_object_keys(coalesce(old.stock_usage,'{}')||newrow.stock_usage) loop
  ops:=ops||jsonb_build_object(k,jsonb_build_object('dc',
    (case when coalesce(old.stock_deducted,false) then coalesce((old.stock_usage->>k)::int,0) else 0 end)-
    (case when newrow.stock_deducted then coalesce((newrow.stock_usage->>k)::int,0) else 0 end)));
 end loop;
 perform app_private.inventory_delta(cid,ops);
 if old.id is null then insert into orders select newrow.*;
 else update orders set items=newrow.items,total=newrow.total,payment=newrow.payment,split=newrow.split,staff=newrow.staff,
  settled_at=newrow.settled_at,cancel_reason=newrow.cancel_reason,prep_status=newrow.prep_status,acknowledged_at=newrow.acknowledged_at,
  stock_deducted=newrow.stock_deducted,stock_usage=newrow.stock_usage,revision=newrow.revision where id=oid;
 end if;
 return jsonb_build_object('status','ok','order',to_jsonb(newrow));
end $$;

-- Generic record edits: allowed columns only, tenant derived from the stored
-- row, changed-field compare-and-swap, and receipts for retry safety.
create or replace function app_mutate(p_id uuid,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); actor text; result jsonb; previous app_private.operations;
 t text:=p_payload->>'table'; a jsonb:=nullif(p_payload->'after','null'::jsonb); b jsonb:=nullif(p_payload->'before','null'::jsonb); rowdata jsonb; cid text; k text; v jsonb; patch jsonb:='{}'; cols text; vals text; allowed text[];
begin
 actor:=case when s.role is not null then concat_ws(':',s.role,s.cart_id,s.name) else app_private.customer()::text end;
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into previous from app_private.operations where id=p_id;
 if found then
  if previous.actor<>actor then raise exception 'Not authorised' using errcode='42501'; end if;
  return previous.result;
 end if;
 if p_kind='order' then result:=app_private.write_order(p_payload);
 elsif p_kind in ('inventory','consumables','menu') then
  cid:=p_payload->>'cartId';
  if not app_private.allowed(cid,case when p_kind='inventory' then array['admin','owner','staff'] else array['admin','owner'] end) then raise exception 'Not authorised' using errcode='42501'; end if;
  if p_kind='inventory' then
   if s.role='staff' and exists(select 1 from jsonb_each(p_payload->'ops') e where e.value-'dc'<>'{}'::jsonb or (e.value->>'dc')::numeric>0) then raise exception 'Not authorised' using errcode='42501'; end if;
   result:=jsonb_build_object('status','ok','cartInv',app_private.inventory_delta(cid,p_payload->'ops'));
  elsif p_kind='consumables' then
   perform app_private.inventory_delta(cid,'{}');
   update inventory set data=jsonb_set(data,array[cid,'consumables'],p_payload->'value',true),updated_at=now() where id=1;
   result:=jsonb_build_object('status','ok');
  else
   select data->cid into rowdata from menus where id=1 for update;
   if rowdata is distinct from nullif(p_payload->'before','null'::jsonb) then result:=jsonb_build_object('status','conflict','message','Menu changed on another device. Reload before editing.');
   else
    insert into menus(id,data) values(1,jsonb_build_object(cid,p_payload->'value')) on conflict(id) do update
     set data=jsonb_set(menus.data,array[cid],p_payload->'value',true),updated_at=now();
    result:=jsonb_build_object('status','ok');
   end if;
  end if;
 elsif p_kind='row' then
  if t not in ('carts','staff','stock_logs','cart_loadings','day_close_logs','wastage_logs','expenses','payout_marks') then raise exception 'Invalid table'; end if;
  execute format('select to_jsonb(x) from public.%I x where id::text=$1 for update',t) into rowdata using coalesce(a->>'id',b->>'id');
  cid:=case when t='carts' then coalesce(rowdata->>'id',a->>'id') else coalesce(rowdata->>'cart_id',a->>'cart_id') end;
  if not app_private.allowed(cid,case when t='wastage_logs' then array['admin','owner','staff'] else array['admin','owner'] end) then
   if not (t='carts' and app_private.allowed(cid) and a-'id'-'default_prep_mins'='{}'::jsonb) then raise exception 'Not authorised' using errcode='42501'; end if;
  end if;
  if t='carts' and (rowdata is null or a is null or a->'owner_mobile' is distinct from b->'owner_mobile' or a->'active' is distinct from b->'active') and s.role<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
  if t='staff' and rowdata is null then raise exception 'Use staff registration'; end if;
  if a is null then
   if t not in ('staff','carts','expenses','stock_logs') then raise exception 'Deletion not allowed'; end if;
   if rowdata is not null then
    if t='carts' then update carts set active=false where id=cid;
    else execute format('delete from public.%I where id::text=$1',t) using b->>'id'; end if;
   end if;
  else
   if a ? 'cart_id' and rowdata is not null and a->>'cart_id' is distinct from cid then raise exception 'Cannot move records'; end if;
   allowed:=case t
    when 'carts' then array['id','name','tagline','cuisine','location','timing','emoji','accent','logo','phone','instagram','upi_id','upi_qr','open_time','close_time','closed_manually','default_prep_mins','owner_name','owner_mobile','active','created_at']
    when 'staff' then array['id','cart_id','name','mobile','active']
    else (select array_agg(column_name::text) from information_schema.columns where table_schema='public' and table_name=t and column_name<>'inserted_at') end;
   for k,v in select * from jsonb_each(a) loop
    if not k=any(allowed) then raise exception 'Column not allowed: %',k; end if;
    if rowdata is null or (k<>'id' and v is distinct from b->k) then
     if rowdata is not null and rowdata->k is distinct from coalesce(b->k,'null'::jsonb) then
      return jsonb_build_object('status','conflict','message','Record changed on another device. Reload and retry.');
     end if;
     patch:=patch||jsonb_build_object(k,v);
    end if;
   end loop;
   if patch<>'{}'::jsonb then
    select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into cols,vals from jsonb_each(patch);
    if rowdata is null then
     execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r',t,cols,vals,t) using patch;
    else
     execute format('update public.%I set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1) r) where id::text=$2',t,cols,vals,t) using patch,a->>'id';
    end if;
   end if;
  end if;
  if t='carts' and rowdata is not null and patch ? 'owner_mobile' then delete from app_sessions where role='owner' and cart_id=cid; end if;
  result:=jsonb_build_object('status','ok');
 else raise exception 'Invalid command'; end if;
 insert into app_private.operations(id,actor,result) values(p_id,actor,result);
 return result;
end $$;

-- Replace every legacy permissive policy. Direct browser writes are forbidden.
do $$ declare r record; t text; c record; begin
 for r in select tablename,policyname from pg_policies where schemaname='public' loop
  execute format('drop policy %I on public.%I',r.policyname,r.tablename);
 end loop;
 foreach t in array array['orders','stock_logs','cart_loadings','day_close_logs','inventory','staff','carts','platform','menus','wastage_logs','expenses','order_counters','payout_marks','app_sessions','menus_history','push_subscriptions','reminder_sends'] loop
  if to_regclass('public.'||t) is null then continue; end if;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  -- Table revocation does not remove the old column-level grants.
  for c in select column_name from information_schema.columns where table_schema='public' and table_name=t loop
   execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.%I from anon,authenticated',c.column_name,c.column_name,c.column_name,c.column_name,t);
  end loop;
 end loop;
 foreach t in array array['orders','stock_logs','cart_loadings','day_close_logs','wastage_logs','expenses','payout_marks'] loop
  execute format('grant select on public.%I to anon',t);
  execute format('create policy team_read on public.%I for select to anon using (app_private.allowed(cart_id))',t);
 end loop;
end $$;
create policy customer_read on orders for select to anon using(customer_key=(select app_private.customer()));
create policy backend_orders on orders for select to anon using((select app_private.backend()));
grant select(id,name,tagline,cuisine,location,timing,emoji,accent,logo,phone,instagram,upi_id,upi_qr,open_time,close_time,closed_manually,default_prep_mins,owner_name,owner_mobile,active,created_at) on carts to anon;
create policy team_carts on carts for select to anon using(app_private.allowed(id) or (select app_private.backend()));
grant select(id,cart_id,name,mobile,active,updated_at) on staff to anon;
create policy team_staff on staff for select to anon using(app_private.allowed(cart_id));
-- Menus contain public product/pricing data; protected writes use app_mutate.
grant select on menus to anon;
create policy public_menu on menus for select to anon using(true);

-- Push tables may be absent on fresh installs.
create table if not exists push_subscriptions(endpoint text primary key,cart_id text not null,role text,p256dh text,auth text,updated_at timestamptz default now());
create table if not exists reminder_sends(cart_id text,date date,kind text,sent_at timestamptz,primary key(cart_id,date,kind));
alter table push_subscriptions enable row level security;
alter table reminder_sends enable row level security;
revoke all on push_subscriptions,reminder_sends from anon,authenticated;
grant select,insert,update,delete on push_subscriptions,reminder_sends to anon;
create policy backend_push on push_subscriptions for all to anon using((select app_private.backend())) with check((select app_private.backend()));
create policy backend_reminders on reminder_sends for all to anon using((select app_private.backend())) with check((select app_private.backend()));

-- No obsolete SECURITY DEFINER write function remains callable by the browser.
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.prosecdef loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.sig);
 end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.allowed(text,text[]),app_private.customer(),app_private.backend(),app_private.header(text) to anon;
grant execute on function app_identity(),app_logout(),app_login(text,text,text),app_set_password(text,text,text,text),app_catalog(),app_inventory(),app_mutate(uuid,text,jsonb),app_change_owner_password(uuid,text),app_set_staff_password(uuid,bigint,text),app_register_staff(uuid,bigint,text,text,text),app_admin_reset_owner(uuid,text,text),app_admin_set_recovery(uuid,text),app_admin_recover(text,text,text) to anon;
notify pgrst,'reload schema';

create or replace function app_claim_notification(p_order bigint) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare o orders;
begin
 select * into o from orders where id=p_order for update;
 if o.id is null or not (app_private.allowed(o.cart_id) or coalesce(o.customer_key=app_private.customer(),false)) then raise exception 'Not authorised' using errcode='42501'; end if;
 if o.notified_at is not null or o.payment<>'pending' or o.acknowledged_at is not null then return null; end if;
 update orders set notified_at=now() where id=p_order;
 return jsonb_build_object('id',o.id,'cart_id',o.cart_id,'token',o.token,'total',o.total);
end $$;
revoke all on function app_claim_notification(bigint) from public,anon,authenticated;
grant execute on function app_claim_notification(bigint) to anon;

alter function public.snapshot_menus() set search_path=public;
alter function public.set_cart_menu(text,jsonb) set search_path=public;

create or replace function app_change_owner_password(p_token uuid, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s app_sessions;
begin
  s := app_session(p_token);
  if s.role is null or s.role <> 'owner' then return json_build_object('status','error','message','Not authorised'); end if;
  if length(p_password) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  update carts set owner_password_hash = app_hash(p_password) where id = s.cart_id;
  delete from app_sessions where role='owner' and cart_id=s.cart_id and token<>p_token;
  return json_build_object('status','ok');
end; $$;

create or replace function app_set_staff_password(p_token uuid, p_staff_id bigint, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s app_sessions; sc text;
begin
  s := app_session(p_token);
  if s.role is null or s.role <> 'owner' then return json_build_object('status','error','message','Not authorised'); end if;
  if length(p_password) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  select cart_id into sc from staff where id = p_staff_id;
  if sc is distinct from s.cart_id then return json_build_object('status','error','message','Not your staff'); end if;
  update staff set password_hash = app_hash(p_password) where id = p_staff_id;
  delete from app_sessions where role='staff' and cart_id=sc and (staff_id=p_staff_id or staff_id is null);
  return json_build_object('status','ok');
end; $$;

create or replace function app_admin_reset_owner(p_token uuid, p_cart_id text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s app_sessions;
begin
  s := app_session(p_token);
  if s.role is null or s.role <> 'admin' then return json_build_object('status','error','message','Not authorised'); end if;
  if length(p_password) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  update carts set owner_password_hash = app_hash(p_password) where id = p_cart_id;
  delete from app_sessions where role='owner' and cart_id=p_cart_id;
  return json_build_object('status','ok');
end; $$;

create or replace function app_admin_recover(p_mobile text, p_code text, p_new_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare adm record; tok uuid; exp timestamptz := now() + interval '24 hours'; n int;
begin
  insert into app_private.login_attempts values(p_mobile||':recovery',1,now()) on conflict(mobile) do update
    set attempts=case when login_attempts.since<now()-interval '15 minutes' then 1 else login_attempts.attempts+1 end,
        since=case when login_attempts.since<now()-interval '15 minutes' then now() else login_attempts.since end returning attempts into n;
  if n>10 then return json_build_object('status','error','message','Too many recovery attempts. Try again in 15 minutes.'); end if;
  select admin_mobile, admin_recovery_hash into adm from platform where id = 1;
  if adm.admin_mobile is null or adm.admin_mobile <> p_mobile then return json_build_object('status','not_registered'); end if;
  if adm.admin_recovery_hash is null then return json_build_object('status','no_recovery'); end if;
  if adm.admin_recovery_hash <> app_hash(coalesce(p_code, '')) then return json_build_object('status','bad_code'); end if;
  if length(coalesce(p_new_password, '')) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  update platform set admin_password_hash = app_hash(p_new_password) where id = 1;
  delete from app_sessions where role='admin';
  delete from app_private.login_attempts where mobile=p_mobile||':recovery';
  insert into app_sessions(role, expires_at) values ('admin', exp) returning token into tok;
  return json_build_object('status','ok','role','admin','token',tok,'expiresAt', extract(epoch from exp)*1000);
end; $$;

revoke all on all tables in schema app_private from public,anon,authenticated;
alter table app_private.operations enable row level security;
alter table app_private.backend_config enable row level security;
alter table app_private.login_attempts enable row level security;
notify pgrst,'reload schema';
