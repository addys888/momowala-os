-- Per-item server records avoid clobbering another phone's unrelated ticks.
create table if not exists public.daily_packing (
 cart_id text not null references public.carts(id), business_date date not null,
 item_id text not null check(length(item_id) between 1 and 128), checked boolean not null,
 updated_at timestamptz not null default now(), primary key(cart_id,business_date,item_id)
);
alter table public.daily_packing enable row level security;
revoke all on public.daily_packing from public,anon,authenticated;
grant select on public.daily_packing to anon;
create policy daily_packing_read on public.daily_packing for select to anon
 using(app_private.allowed(cart_id,array['admin','owner','staff']));
create or replace function public.app_save_packing(p_cart_id text,p_date date,p_changes jsonb,p_import boolean default false)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare k text; v jsonb;
begin
 if not app_private.allowed(p_cart_id,array['admin','owner']) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_date is distinct from (now() at time zone 'Asia/Kolkata')::date then raise exception 'Only today can be changed'; end if;
 if jsonb_typeof(p_changes) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_changes))>200 then raise exception 'Invalid checklist'; end if;
 for k,v in select * from jsonb_each(p_changes) loop
  if length(k) not between 1 and 128 or jsonb_typeof(v)<>'boolean' then raise exception 'Invalid item'; end if;
  if p_import then
   insert into daily_packing(cart_id,business_date,item_id,checked) values(p_cart_id,p_date,k,v::boolean) on conflict do nothing;
  else
   insert into daily_packing(cart_id,business_date,item_id,checked) values(p_cart_id,p_date,k,v::boolean)
   on conflict(cart_id,business_date,item_id) do update set checked=excluded.checked,updated_at=now();
  end if;
 end loop;
 return jsonb_build_object('status','ok');
end $$;
revoke all on function public.app_save_packing(text,date,jsonb,boolean) from public,authenticated;
grant execute on function public.app_save_packing(text,date,jsonb,boolean) to anon;
