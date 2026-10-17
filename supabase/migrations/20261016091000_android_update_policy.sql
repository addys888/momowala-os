-- Release operators alone may raise the required version after publishing and
-- verifying a signed APK. Default does not force any existing installation.
create table if not exists public.android_update_policy (
  id boolean primary key default true check (id),
  minimum_version_code integer not null default 0 check (minimum_version_code >= 0)
);
alter table public.android_update_policy enable row level security;
revoke all on public.android_update_policy from anon, authenticated;
grant select on public.android_update_policy to anon, authenticated;
drop policy if exists android_policy_read on public.android_update_policy;
create policy android_policy_read on public.android_update_policy for select to anon, authenticated using (true);
insert into public.android_update_policy(id) values(true) on conflict do nothing;
