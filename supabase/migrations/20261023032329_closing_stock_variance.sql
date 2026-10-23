begin;
alter table public.closing_reports add column if not exists expected_quantities jsonb;
create or replace function public.app_closing_stock_check(p_cart_id text,p_report_id bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare r closing_reports; expected jsonb; current_day date; stock jsonb;
begin
 if not app_private.closing_manager(p_cart_id) and not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501';end if;
 select * into r from closing_reports where id=p_report_id and cart_id=p_cart_id;
 if not found then raise exception 'Closing report not found';end if;
 if r.expected_quantities is not null then return r.expected_quantities;end if;
 select data->p_cart_id into stock from inventory where id=1 for share;
 select business_date into current_day from app_private.inventory_days where cart_id=p_cart_id;
 if current_day=r.business_date then
  select jsonb_object_agg(t->>'key',(stock->(t->>'key')->>'cart')::numeric) into expected from jsonb_array_elements(r.stock_types) t;
 else select quantities into expected from cart_stock_rollovers where cart_id=p_cart_id and business_date=r.business_date;
 end if;
 if expected is null or exists(select 1 from jsonb_array_elements(r.stock_types) t where expected->(t->>'key') is null or expected->(t->>'key')='null'::jsonb) then raise exception 'Expected stock is unavailable for this closing date. Ask the owner to review stock records.';end if;
 return expected;
end $$;
create or replace function public.app_submit_closing_checked(p_cart_id text,p_report_id bigint,p_operation_id uuid,p_cash numeric,p_quantities jsonb,p_expected jsonb,p_notes text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare expected jsonb; result jsonb;
begin
 if not app_private.closing_manager(p_cart_id) then raise exception 'Only the assigned manager can submit closing' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 perform 1 from inventory where id=1 for update;
 expected:=app_closing_stock_check(p_cart_id,p_report_id);
 if expected is distinct from p_expected then raise exception 'Stock changed. Review the latest expected counts before submitting.';end if;
 if exists(select 1 from jsonb_each(p_quantities) q where q.value is distinct from expected->q.key) and length(trim(coalesce(p_notes,'')))=0 then raise exception 'Explain the stock difference after recounting or checking missing entries.';end if;
 result:=app_submit_closing(p_cart_id,p_report_id,p_operation_id,p_cash,p_quantities,p_notes);
 update closing_reports set expected_quantities=expected where id=p_report_id and cart_id=p_cart_id;
 return result||jsonb_build_object('expected_quantities',expected);
end $$;
revoke all on function public.app_closing_stock_check(text,bigint), public.app_submit_closing_checked(text,bigint,uuid,numeric,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.app_closing_stock_check(text,bigint), public.app_submit_closing_checked(text,bigint,uuid,numeric,jsonb,jsonb,text) to anon;
notify pgrst,'reload schema';
commit;
