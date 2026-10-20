-- Cost allocation is separate from cash purchases, to avoid charging both.
create table if not exists public.cart_cost_profiles (
 cart_id text not null references public.carts(id), effective_from date not null,
 rates jsonb not null, daily_costs jsonb not null, revision bigint not null default 1,
 primary key(cart_id,effective_from)
);
alter table public.cart_cost_profiles add column if not exists variable_costs jsonb not null default '{}';
alter table public.cart_cost_profiles add column if not exists reference_quantities jsonb not null default '{}';
create table if not exists public.daily_profit_reports (
 cart_id text not null references public.carts(id), business_date date not null,
 cost_snapshot jsonb, result jsonb not null, revision bigint not null default 1,
 updated_at timestamptz not null default now(), primary key(cart_id,business_date)
);
alter table public.cart_cost_profiles enable row level security;
alter table public.daily_profit_reports enable row level security;
revoke all on public.cart_cost_profiles,public.daily_profit_reports from public,anon,authenticated;
grant select on public.cart_cost_profiles,public.daily_profit_reports to anon;
drop policy if exists cost_owner_read on public.cart_cost_profiles;
create policy cost_owner_read on public.cart_cost_profiles for select to anon using(app_private.allowed(cart_id,array['owner','admin']));
drop policy if exists profit_owner_read on public.daily_profit_reports;
create policy profit_owner_read on public.daily_profit_reports for select to anon using(app_private.allowed(cart_id,array['owner','admin']));

-- Seed only the requested cart; other carts configure their own costs.
insert into public.cart_cost_profiles(cart_id,effective_from,rates,daily_costs,variable_costs,reference_quantities)
select id,(now() at time zone 'Asia/Kolkata')::date,'{"veg":3,"paneer":5,"corn":5}',
'{"Room rent + electricity":150,"Labour (300 + 300 + 200)":800}',
'{"Fresh cream":100,"Mayo":70,"Oil":200,"Gas":200,"Disposal":200,"Veggies":100,"Mocktail supplies":50,"Coal":30,"Butter":50,"Packing supplies":50,"Other":100}','{"veg":500,"paneer":300,"corn":40}'
from public.carts where id='momowala' on conflict do nothing;

create or replace function app_private.refresh_daily_profit(cid text,d date) returns void
language plpgsql security definer set search_path=public,app_private as $$
declare dc day_close_logs; cr closing_reports; cfg jsonb; old daily_profit_reports; output jsonb; rows jsonb:='[]';
 counts jsonb:='{}'; rates jsonb; overhead numeric:=0; ingredient numeric:=0; unsold_value numeric:=0; loaded_cost numeric:=0; sale_total numeric:=0; pending_total numeric:=0;
 k text; rate numeric; loaded numeric; sold numeric; pending_pcs numeric; returned numeric; adjusted numeric; wasted numeric; remaining numeric; expected numeric;
 missing boolean:=false; unknown_usage boolean:=false; src text; fixed_total numeric:=0; variable_total numeric:=0; reference_total numeric:=0; eligible_sold numeric:=0; scaled jsonb:='{}';
begin
 if cid is null or d is null then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid||':'||d::text,31));
 select * into dc from day_close_logs where cart_id=cid and date=d and closed_at is not null order by closed_at desc,id desc limit 1;
 select * into cr from closing_reports where cart_id=cid and business_date=d and submitted_at is not null;
 if dc.id is null and cr.id is null then return; end if;
 select * into old from daily_profit_reports where cart_id=cid and business_date=d;
 cfg:=case when coalesce((old.result->>'missingRates')::boolean,false) then null else old.cost_snapshot end;
 if cfg is null then select jsonb_build_object('rates',cp.rates,'dailyCosts',cp.daily_costs,'variableCosts',cp.variable_costs,'referenceQuantities',cp.reference_quantities,'effectiveFrom',cp.effective_from) into cfg from cart_cost_profiles cp where cp.cart_id=cid and cp.effective_from<=d order by cp.effective_from desc limit 1; end if;
 src:=case when dc.id is not null then 'reconciliation' else 'manager_closing' end;
 if coalesce(dc.holiday,false) then
  output:=jsonb_build_object('status','holiday','source',src,'sales',0,'soldCost',0,'overhead',0,'profit',0,'rows','[]'::jsonb);
 elsif cfg is null then output:=jsonb_build_object('status','needs_costs','source',src);
 else
  rates:=cfg->'rates';
  if dc.id is not null then
   select coalesce(jsonb_object_agg(x->>'key',x->'actual'),'{}') into counts from jsonb_array_elements(coalesce(dc.stock,'[]')) x where x->>'key' not like '_ware:%' and x->'actual' is not null and x->'actual'<>'null'::jsonb;
   counts:=jsonb_strip_nulls(jsonb_build_object('veg',dc.actual_veg,'paneer',dc.actual_paneer,'corn',dc.actual_corn))||counts;
  else counts:=cr.quantities; end if;
  select coalesce(sum(total),0),coalesce(sum(total) filter(where payment='pending'),0) into sale_total,pending_total from orders where cart_id=cid and date=d and payment<>'cancelled';
  sale_total:=sale_total-pending_total;
  select exists(select 1 from orders where cart_id=cid and date=d and payment not in ('pending','cancelled') and stock_usage is null) into unknown_usage;
  select coalesce(sum(value::numeric),0) into fixed_total from jsonb_each_text(cfg->'dailyCosts');
  select coalesce(sum(value::numeric),0) into reference_total from jsonb_each_text(coalesce(cfg->'referenceQuantities','{}'));
  select coalesce(sum(e.value::numeric),0) into eligible_sold from orders o cross join lateral jsonb_each_text(coalesce(o.stock_usage,'{}')) e where o.cart_id=cid and o.date=d and o.payment not in ('pending','cancelled') and coalesce(cfg->'referenceQuantities','{}') ? e.key;
  select coalesce(jsonb_object_agg(key,round(value::numeric*eligible_sold/nullif(reference_total,0),2)),'{}'),coalesce(sum(round(value::numeric*eligible_sold/nullif(reference_total,0),2)),0) into scaled,variable_total from jsonb_each_text(coalesce(cfg->'variableCosts','{}'));
  overhead:=fixed_total+variable_total;
  for k in select key from jsonb_object_keys(rates||counts) as t(key)
   union select item from cart_loadings where cart_id=cid and date=d
   union select e.key from orders o cross join lateral jsonb_each(coalesce(o.stock_usage,'{}')) e where o.cart_id=cid and o.date=d and o.payment<>'cancelled'
  loop
   select coalesce(sum(qty) filter(where type='CART_LOAD'),0),coalesce(sum(qty) filter(where type='CART_UNLOAD'),0),coalesce(sum(qty) filter(where type='CART_ADJUST'),0) into loaded,returned,adjusted from cart_loadings where cart_id=cid and date=d and item=k;
   select coalesce(sum((stock_usage->>k)::numeric) filter(where payment not in ('pending','cancelled')),0),coalesce(sum((stock_usage->>k)::numeric) filter(where payment='pending' and stock_deducted),0) into sold,pending_pcs from orders where cart_id=cid and date=d;
   select coalesce(sum(qty),0) into wasted from wastage_logs where cart_id=cid and date=d and stock_key=k;
   remaining:=(counts->>k)::numeric; rate:=(rates->>k)::numeric;
   if rate is null and (loaded<>0 or sold<>0 or coalesce(remaining,0)<>0) then missing:=true; end if;
   expected:=loaded-returned+adjusted-sold-pending_pcs-wasted;
   loaded_cost:=loaded_cost+loaded*coalesce(rate,0);ingredient:=ingredient+sold*coalesce(rate,0);unsold_value:=unsold_value+coalesce(remaining,0)*coalesce(rate,0);
   rows:=rows||jsonb_build_array(jsonb_build_object('key',k,'rate',rate,'loaded',loaded,'sold',sold,'unpaidPieces',pending_pcs,'returned',returned,'adjusted',adjusted,'wasted',wasted,'remaining',remaining,'expected',expected,'variance',remaining-expected,'soldCost',sold*rate,'unsoldValue',remaining*rate,'loadedCost',loaded*rate,'returnedValue',returned*rate,'wastageValue',wasted*rate));
  end loop;
  output:=jsonb_build_object('status',case when missing or unknown_usage or coalesce(dc.unrecorded,false) then 'incomplete' else 'ready' end,
   'source',src,'sales',sale_total,'pendingSales',pending_total,'soldCost',ingredient,'overhead',overhead,
   'profit',case when missing or unknown_usage or coalesce(dc.unrecorded,false) then null else sale_total-ingredient-overhead end,
   'unsoldValue',unsold_value,'loadedCost',loaded_cost,'preparationCost',loaded_cost+overhead,'rows',rows,'dailyCosts',(cfg->'dailyCosts')||scaled,'fixedCosts',cfg->'dailyCosts','variableCosts',scaled,'referenceCosts',cfg->'variableCosts','referenceQuantities',cfg->'referenceQuantities','referencePieces',reference_total,'soldReferencePieces',eligible_sold,'fixedTotal',fixed_total,'variableTotal',variable_total,'missingRates',missing,'missingOrderUsage',unknown_usage,'manualSales',coalesce(dc.unrecorded,false),
   'countedCollections',case when dc.id is not null then coalesce(dc.physical_cash,0)+coalesce(dc.phonepe_amount,0) else null end);
 end if;
 insert into daily_profit_reports(cart_id,business_date,cost_snapshot,result) values(cid,d,cfg,output)
 on conflict(cart_id,business_date) do update set cost_snapshot=excluded.cost_snapshot,result=excluded.result,revision=daily_profit_reports.revision+1,updated_at=now()
 where daily_profit_reports.result is distinct from excluded.result or daily_profit_reports.cost_snapshot is distinct from excluded.cost_snapshot;
end $$;

create or replace function app_private.profit_changed() returns trigger
language plpgsql security definer set search_path=public,app_private as $$
declare rowdata jsonb; beforedata jsonb; d date;
begin
 rowdata:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 d:=coalesce(rowdata->>'business_date',rowdata->>'date')::date;
 perform app_private.refresh_daily_profit(rowdata->>'cart_id',d);
 if tg_op='UPDATE' then
  beforedata:=to_jsonb(old);
  if (beforedata->>'cart_id',coalesce(beforedata->>'business_date',beforedata->>'date')) is distinct from (rowdata->>'cart_id',d::text) then
   perform app_private.refresh_daily_profit(beforedata->>'cart_id',coalesce(beforedata->>'business_date',beforedata->>'date')::date);
  end if;
 end if;
 return null;
end $$;
do $$ declare t text; begin
 foreach t in array array['orders','cart_loadings','wastage_logs','day_close_logs','closing_reports'] loop
  execute format('drop trigger if exists daily_profit_changed on public.%I',t);
  execute format('create constraint trigger daily_profit_changed after insert or update or delete on public.%I deferrable initially deferred for each row execute function app_private.profit_changed()',t);
 end loop;
end $$;

create or replace function public.app_profit_day(p_cart_id text,p_date date) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare r daily_profit_reports; cfg cart_cost_profiles;
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_date is null then raise exception 'Choose a date'; end if;
 perform app_private.refresh_daily_profit(p_cart_id,p_date);
 select * into r from daily_profit_reports where cart_id=p_cart_id and business_date=p_date;
 select * into cfg from cart_cost_profiles where cart_id=p_cart_id and effective_from<=p_date order by effective_from desc limit 1;
 return jsonb_build_object('report',case when r.cart_id is null then null else to_jsonb(r) end,'config',case when cfg.cart_id is null then null else to_jsonb(cfg) end);
end $$;
drop function if exists public.app_save_cost_profile(text,date,jsonb,jsonb,bigint);
create or replace function public.app_save_cost_profile(p_cart_id text,p_date date,p_rates jsonb,p_costs jsonb,p_revision bigint,p_variable_costs jsonb default '{}',p_reference_quantities jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare r cart_cost_profiles; k text; v jsonb; dd date; ref_total numeric:=0;
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_date is null or p_revision is null or p_rates is null or p_costs is null or jsonb_typeof(p_rates)<>'object' or jsonb_typeof(p_costs)<>'object' or p_rates='{}'::jsonb or length(p_rates::text)>10000 or length(p_costs::text)>10000 then raise exception 'Enter stock rates and daily costs'; end if;
 if p_variable_costs is null or p_reference_quantities is null or jsonb_typeof(p_variable_costs)<>'object' or jsonb_typeof(p_reference_quantities)<>'object' or length(p_variable_costs::text)>10000 or length(p_reference_quantities::text)>10000 then raise exception 'Enter variable costs and reference quantities'; end if;
 if exists(select 1 from jsonb_object_keys(p_variable_costs) x where p_costs ? x) then raise exception 'Use different names for fixed and variable costs'; end if;
 for k,v in select * from jsonb_each(p_rates) union all select * from jsonb_each(p_costs) union all select * from jsonb_each(p_variable_costs) loop
  if length(k)<1 or length(k)>100 or jsonb_typeof(v)<>'number' then raise exception 'Enter numeric costs'; end if;
  if v::text::numeric<0 or v::text::numeric>1000000 or v::text::numeric<>round(v::text::numeric,2) then raise exception 'Costs must be nonnegative with at most two decimals'; end if;
 end loop;
 for k,v in select * from jsonb_each(p_reference_quantities) loop
  if not p_rates ? k or jsonb_typeof(v)<>'number' then raise exception 'Reference stock must have a unit rate'; end if;
  if v::text::numeric<0 or v::text::numeric>1000000 or v::text::numeric<>trunc(v::text::numeric) then raise exception 'Reference pieces must be whole and nonnegative'; end if;
  ref_total:=ref_total+v::text::numeric;
 end loop;
 if p_variable_costs<>'{}'::jsonb and ref_total<=0 then raise exception 'Enter a reference batch greater than zero'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,32));
 select * into r from cart_cost_profiles where cart_id=p_cart_id and effective_from=p_date;
 if coalesce(r.revision,0) is distinct from p_revision then raise exception 'Cost settings changed. Reload before saving.'; end if;
 insert into cart_cost_profiles(cart_id,effective_from,rates,daily_costs,variable_costs,reference_quantities) values(p_cart_id,p_date,p_rates,p_costs,p_variable_costs,p_reference_quantities)
 on conflict(cart_id,effective_from) do update set rates=excluded.rates,daily_costs=excluded.daily_costs,variable_costs=excluded.variable_costs,reference_quantities=excluded.reference_quantities,revision=cart_cost_profiles.revision+1 returning * into r;
 -- Previously closed reports retain their original rates; days without costs can now be completed.
 for dd in select date from day_close_logs where cart_id=p_cart_id and date>=p_date and closed_at is not null
 union select business_date from closing_reports where cart_id=p_cart_id and business_date>=p_date and submitted_at is not null loop
  perform app_private.refresh_daily_profit(p_cart_id,dd);
 end loop;
 return to_jsonb(r);
end $$;
revoke all on function app_private.refresh_daily_profit(text,date),app_private.profit_changed() from public,anon,authenticated;
revoke all on function public.app_profit_day(text,date),public.app_save_cost_profile(text,date,jsonb,jsonb,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.app_profit_day(text,date),public.app_save_cost_profile(text,date,jsonb,jsonb,bigint,jsonb,jsonb) to anon;
notify pgrst,'reload schema';
