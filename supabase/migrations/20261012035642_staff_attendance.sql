-- Owner-managed personnel records, separate from staff login/public operational reads.
create table if not exists public.staff_hr (
 staff_id bigint primary key references public.staff(id) on delete cascade,
 cart_id text not null references public.carts(id),
 details jsonb not null default '{}',
 updated_at timestamptz not null default now()
);
alter table public.staff_hr enable row level security;
revoke all on public.staff_hr from public,anon,authenticated;
grant select on public.staff_hr to anon;
drop policy if exists owner_read on public.staff_hr;
create policy owner_read on public.staff_hr for select to anon
 using(app_private.allowed(cart_id,array['admin','owner']));

create or replace function public.app_save_staff_detail(p_staff_id bigint,p_field text,p_date text,p_before jsonb,p_value jsonb)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare cid text; record staff_hr; path text[]; previous jsonb; value jsonb:=nullif(p_value,'null'::jsonb); date_value date;
begin
 select cart_id into cid from staff where id=p_staff_id for key share;
 if cid is null or not app_private.allowed(cid,array['admin','owner']) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_field not in ('onboardingDate','monthlyOffAllowance','notes','day') or p_field is null then raise exception 'Invalid field'; end if;
 if p_field='day' then
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  date_value:=p_date::date;
  if to_char(date_value,'YYYY-MM-DD')<>p_date then raise exception 'Invalid date'; end if;
  path:=array['daysOff',p_date];
  if value is not null and (jsonb_typeof(value)<>'object' or value-'type'-'duration'-'note'<>'{}'::jsonb or coalesce(value->>'type','') not in ('weekly_off','holiday','leave','sick_leave','absence') or coalesce(value->>'duration','') not in ('0.5','1') or jsonb_typeof(value->'duration')<>'number' or length(coalesce(value->>'note',''))>500 or (value ? 'note' and jsonb_typeof(value->'note')<>'string')) then raise exception 'Invalid day-off details'; end if;
 else
  path:=array[p_field];
  if value is not null then
   if p_field='onboardingDate' then
    if jsonb_typeof(value)<>'string' or value#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid onboarding date'; end if;
    date_value:=(value#>>'{}')::date;
   elsif p_field='monthlyOffAllowance' then
    if jsonb_typeof(value)<>'number' or (value#>>'{}')::numeric<0 or (value#>>'{}')::numeric>31 or mod((value#>>'{}')::numeric,0.5)<>0 then raise exception 'Allowance must be between 0 and 31 in half-day steps'; end if;
   elsif jsonb_typeof(value)<>'string' or length(value#>>'{}')>2000 then raise exception 'Notes are too long';
   end if;
  end if;
 end if;
 insert into staff_hr(staff_id,cart_id) values(p_staff_id,cid) on conflict(staff_id) do nothing;
 select * into record from staff_hr where staff_id=p_staff_id for update;
 previous:=record.details#>path;
 -- A response lost after commit can safely be retried without duplicate leave.
 if previous is not distinct from value then return jsonb_build_object('status','ok','record',to_jsonb(record)); end if;
 if previous is distinct from nullif(p_before,'null'::jsonb) then return jsonb_build_object('status','conflict','message','This field changed on another device. Latest data has been loaded; review and save again.','record',to_jsonb(record)); end if;
 if p_field='day' and value is not null and record.details->>'onboardingDate' is not null and p_date<(record.details->>'onboardingDate') then raise exception 'A day off cannot be before the onboarding date'; end if;
 if p_field='onboardingDate' and value is not null and exists(select 1 from jsonb_object_keys(coalesce(record.details->'daysOff','{}')) d where d < value#>>'{}') then raise exception 'Onboarding date cannot be after an existing day-off record'; end if;
 if value is null then record.details:=record.details#-path;
 else
  if p_field='day' and not record.details ? 'daysOff' then record.details:=record.details||'{"daysOff":{}}'::jsonb; end if;
  record.details:=jsonb_set(record.details,path,value,true);
 end if;
 update staff_hr set details=record.details,updated_at=now() where staff_id=p_staff_id returning * into record;
 return jsonb_build_object('status','ok','record',to_jsonb(record));
end $$;
revoke all on function public.app_save_staff_detail(bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.app_save_staff_detail(bigint,text,text,jsonb,jsonb) to anon;
notify pgrst,'reload schema';
