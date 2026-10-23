-- Permanent references; historical quantities, timestamps and business dates stay unchanged.
begin;
lock table public.opening_loads in access exclusive mode;
create sequence app_private.opening_reference_seq;
alter table public.opening_loads add column reference_number bigint;
with numbered as (
 select cart_id,business_date,row_number() over(order by created_at,cart_id,business_date) as n
 from public.opening_loads
)
update public.opening_loads o set reference_number=n.n from numbered n
where o.cart_id=n.cart_id and o.business_date=n.business_date;
select setval('app_private.opening_reference_seq',greatest(coalesce(max(reference_number),0)+1,1),false) from public.opening_loads;
alter table public.opening_loads alter column reference_number set default nextval('app_private.opening_reference_seq');
alter table public.opening_loads alter column reference_number set not null;
alter table public.opening_loads add constraint opening_load_reference_unique unique(reference_number);
revoke all on sequence app_private.opening_reference_seq from public,anon,authenticated;
commit;
