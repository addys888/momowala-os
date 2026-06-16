-- ============================================
-- MOMO WALA OS — Supabase schema
-- Run this once in the Supabase dashboard:
-- SQL Editor → New query → paste → Run
-- ============================================

-- Every sale (staff entry or customer QR order). ids come from the app
-- (Date.now()), rows are insert-once and never updated.
create table if not exists orders (
  id bigint primary key,
  token text not null,
  date date not null,
  time text not null,
  items jsonb not null default '[]',
  total integer not null,
  payment text not null check (payment in ('cash', 'upi', 'pending', 'cancelled')),
  cancel_reason text,
  staff text,
  source text,
  settled_at timestamptz,
  outlet text,
  outlet_name text,
  inserted_at timestamptz not null default now()
);

create index if not exists orders_date_idx on orders (date);

-- Supplier deliveries recorded by the owner.
create table if not exists stock_logs (
  id bigint primary key,
  date date not null,
  time text,
  type text,
  item text,
  qty integer,
  note text,
  inserted_at timestamptz not null default now()
);

-- Freezer → cart stock movements.
create table if not exists cart_loadings (
  id bigint primary key,
  date date not null,
  time text,
  type text,
  item text,
  qty integer,
  note text,
  inserted_at timestamptz not null default now()
);

-- End-of-day reconciliation reports (the 10:30 PM ritual).
create table if not exists day_close_logs (
  id bigint primary key,
  date date not null,
  total_orders integer,
  system_cash integer,
  physical_cash integer,
  cash_diff integer,
  system_upi integer,
  phonepe_amount integer,
  upi_diff integer,
  expected_veg integer,
  actual_veg integer,
  veg_diff integer,
  expected_paneer integer,
  actual_paneer integer,
  paneer_diff integer,
  expected_corn integer,
  actual_corn integer,
  corn_diff integer,
  pieces_sold integer,
  revenue integer,
  closed_at timestamptz,
  inserted_at timestamptz not null default now()
);

-- Current stock snapshot (freezer/cart counts, consumables, beverages).
-- Single row, mirrors the app's inventory object as jsonb.
create table if not exists inventory (
  id integer primary key check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Staff accounts, each tied to one cart. Registered by that cart's owner.
-- Passwords are stored as SHA-256 hashes, never plain.
create table if not exists staff (
  id bigint primary key,
  cart_id text,
  name text not null,
  mobile text not null unique,
  password_hash text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- QSR carts (tenants). Onboarded by the Cartlyft platform admin.
create table if not exists carts (
  id text primary key,
  name text not null,
  tagline text,
  cuisine text,
  location text,
  timing text,
  emoji text,
  accent text,
  logo text,
  phone text,
  instagram text,
  upi_id text,
  upi_qr text,
  open_time text,
  close_time text,
  closed_manually boolean default false,
  default_prep_mins integer,
  owner_name text,
  owner_mobile text,
  owner_password_hash text,
  active boolean not null default true,
  created_at text
);

-- Single-row platform admin account (Cartlyft super-admin).
create table if not exists platform (
  id integer primary key check (id = 1),
  admin_mobile text,
  admin_password_hash text,
  updated_at timestamptz not null default now()
);

-- Per-cart menus, stored as one JSON blob keyed { [cartId]: {items,lassi,addons} }.
create table if not exists menus (
  id integer primary key check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Staff-logged damaged / wasted momos (deducted from cart stock).
create table if not exists wastage_logs (
  id bigint primary key,
  cart_id text,
  date date not null,
  time text,
  stock_key text,
  label text,
  qty integer,
  reason text,
  staff text,
  inserted_at timestamptz not null default now()
);

-- Owner-recorded raw-material / stock expenses.
create table if not exists expenses (
  id bigint primary key,
  cart_id text,
  date date not null,
  category text,
  amount integer,
  note text,
  inserted_at timestamptz not null default now()
);

-- Per-cart, per-day order token counter. Tokens are allocated atomically by
-- the next_order_token() RPC so two devices ordering at once can never get the
-- same number (the old client-side count+1 collided across phones).
create table if not exists order_counters (
  cart_id text not null,
  date date not null,
  last_token integer not null default 0,
  primary key (cart_id, date)
);

-- Atomically bump and return the next token for (cart, day). The INSERT ... ON
-- CONFLICT DO UPDATE ... RETURNING is a single atomic row operation, so
-- concurrent callers are serialised and each gets a distinct number.
create or replace function next_order_token(p_cart_id text, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  insert into order_counters (cart_id, date, last_token)
  values (p_cart_id, p_date, 1)
  on conflict (cart_id, date)
  do update set last_token = order_counters.last_token + 1
  returning last_token into v;
  return v;
end;
$$;
grant execute on function next_order_token(text, date) to anon;

-- ── Row Level Security ──
-- v1 has no user accounts: the app talks to Supabase with the anon key, so
-- these policies allow anon read/write. That means anyone who has your URL
-- + anon key can write too — acceptable for a single-cart pilot, but add
-- Supabase Auth and tighten these policies before sharing the app publicly.
alter table orders enable row level security;
alter table stock_logs enable row level security;
alter table cart_loadings enable row level security;
alter table day_close_logs enable row level security;
alter table inventory enable row level security;
alter table staff enable row level security;
alter table carts enable row level security;
alter table platform enable row level security;

-- drop-then-create so the whole file is safe to re-run
do $$
declare t text;
begin
  foreach t in array array['orders','stock_logs','cart_loadings','day_close_logs','inventory','staff','carts','menus','wastage_logs','expenses','order_counters']
  loop
    execute format('drop policy if exists "anon full access" on %I', t);
    execute format('create policy "anon full access" on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- CREDENTIAL LOCKDOWN — keep password hashes away from the browser
-- ════════════════════════════════════════════════════════════════
-- The browser uses the anon key. Without this section anyone with that key
-- could read every owner/staff/admin password hash and overwrite them.
-- Here we (1) hide the hash columns from anon via column-level grants,
-- (2) lock the platform table entirely, and (3) expose login + password
-- changes through SECURITY DEFINER functions that run as the table owner,
-- so the hashes never leave the database.
create extension if not exists pgcrypto;

-- Same hash the app used client-side before: sha256('momowala:' || password).
-- search_path includes extensions because pgcrypto's digest() lives there on Supabase.
create or replace function app_hash(p text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(digest('momowala:' || p, 'sha256'), 'hex');
$$;

-- Server-side sessions: app_login mints an opaque token; privileged password
-- changes are authorised by that token (no secret/JWT to manage, no re-prompt).
create table if not exists app_sessions (
  token uuid primary key default gen_random_uuid(),
  role text not null,
  cart_id text,
  name text,
  expires_at timestamptz not null
);
alter table app_sessions enable row level security;  -- no anon policy ⇒ only definer funcs touch it

-- Column-level lockdown: revoke blanket access, then re-grant every column
-- EXCEPT the password hash. Each privilege needs its OWN column list — a shared
-- list would bind only to the last privilege and leave SELECT table-wide (which
-- would still expose the hash). Service role / definer funcs are unaffected.
revoke all on carts from anon;
grant select (id, name, tagline, cuisine, location, timing, emoji, accent, logo, phone, instagram, upi_id, upi_qr, open_time, close_time, closed_manually, default_prep_mins, owner_name, owner_mobile, active, created_at) on carts to anon;
grant insert (id, name, tagline, cuisine, location, timing, emoji, accent, logo, phone, instagram, upi_id, upi_qr, open_time, close_time, closed_manually, default_prep_mins, owner_name, owner_mobile, active, created_at) on carts to anon;
grant update (name, tagline, cuisine, location, timing, emoji, accent, logo, phone, instagram, upi_id, upi_qr, open_time, close_time, closed_manually, default_prep_mins, owner_name, owner_mobile, active) on carts to anon;
grant delete on carts to anon;

revoke all on staff from anon;
grant select (id, cart_id, name, mobile, active, updated_at) on staff to anon;
grant insert (id, cart_id, name, mobile, active, updated_at) on staff to anon;
grant update (cart_id, name, mobile, active, updated_at) on staff to anon;
grant delete on staff to anon;

-- platform holds the admin hash → no anon access at all (funcs handle it).
drop policy if exists "anon full access" on platform;
revoke all on platform from anon;
-- Ensure the single platform row exists so the admin can set a password.
insert into platform (id, admin_mobile) values (1, '9452661608') on conflict (id) do nothing;

-- Helper: validate a session token, returning the row or null.
create or replace function app_session(p_token uuid)
returns app_sessions language sql security definer set search_path = public, extensions as $$
  select * from app_sessions where token = p_token and expires_at > now();
$$;

-- LOGIN — verifies a role and, on success, returns a session token. The admin
-- and a cart owner may share a mobile number, so the caller passes the context:
-- 'admin' (from /admin/login) checks only the platform admin; anything else
-- (the cart-team login) checks owner then staff.
create or replace function app_login(p_mobile text, p_password text, p_context text default 'team')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare adm record; r record; tok uuid; exp timestamptz := now() + interval '8 hours';
begin
  if p_context = 'admin' then
    select admin_mobile, admin_password_hash into adm from platform where id = 1;
    if adm.admin_mobile is null or adm.admin_mobile <> p_mobile then return json_build_object('status','not_registered'); end if;
    if adm.admin_password_hash is null then return json_build_object('status','needs_setup','role','admin'); end if;
    if adm.admin_password_hash <> app_hash(p_password) then return json_build_object('status','wrong_password'); end if;
    insert into app_sessions(role, expires_at) values ('admin', exp) returning token into tok;
    return json_build_object('status','ok','role','admin','token',tok,'expiresAt', extract(epoch from exp)*1000);
  end if;

  select id, owner_password_hash into r from carts where owner_mobile = p_mobile and active limit 1;
  if found then
    if r.owner_password_hash is null then return json_build_object('status','needs_setup','role','owner','cart_id',r.id); end if;
    if r.owner_password_hash <> app_hash(p_password) then return json_build_object('status','wrong_password'); end if;
    insert into app_sessions(role, cart_id, expires_at) values ('owner', r.id, exp) returning token into tok;
    return json_build_object('status','ok','role','owner','cart_id',r.id,'token',tok,'expiresAt', extract(epoch from exp)*1000);
  end if;

  select id, cart_id, name, password_hash into r from staff where mobile = p_mobile and active limit 1;
  if found then
    if r.password_hash is null then return json_build_object('status','no_password'); end if;
    if r.password_hash <> app_hash(p_password) then return json_build_object('status','wrong_password'); end if;
    insert into app_sessions(role, cart_id, name, expires_at) values ('staff', r.cart_id, r.name, exp) returning token into tok;
    return json_build_object('status','ok','role','staff','cart_id',r.cart_id,'name',r.name,'token',tok,'expiresAt', extract(epoch from exp)*1000);
  end if;

  return json_build_object('status','not_registered');
end; $$;
grant execute on function app_login(text, text, text) to anon;

-- FIRST-TIME password set (owner/admin), only allowed while the hash is null.
create or replace function app_set_password(p_role text, p_mobile text, p_cart_id text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare tok uuid; exp timestamptz := now() + interval '8 hours';
begin
  if length(p_password) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  if p_role = 'admin' then
    update platform set admin_password_hash = app_hash(p_password)
      where id = 1 and admin_mobile = p_mobile and admin_password_hash is null;
    if not found then return json_build_object('status','error','message','Already set — please log in'); end if;
    insert into app_sessions(role, expires_at) values ('admin', exp) returning token into tok;
    return json_build_object('status','ok','role','admin','token',tok,'expiresAt', extract(epoch from exp)*1000);
  elsif p_role = 'owner' then
    update carts set owner_password_hash = app_hash(p_password)
      where id = p_cart_id and active and owner_password_hash is null;
    if not found then return json_build_object('status','error','message','Already set or cart not found'); end if;
    insert into app_sessions(role, cart_id, expires_at) values ('owner', p_cart_id, exp) returning token into tok;
    return json_build_object('status','ok','role','owner','cart_id',p_cart_id,'token',tok,'expiresAt', extract(epoch from exp)*1000);
  end if;
  return json_build_object('status','error','message','Unsupported role');
end; $$;
grant execute on function app_set_password(text, text, text, text) to anon;

-- Owner changes their own password (authorised by their session token).
create or replace function app_change_owner_password(p_token uuid, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s app_sessions;
begin
  s := app_session(p_token);
  if s.role is null or s.role <> 'owner' then return json_build_object('status','error','message','Not authorised'); end if;
  if length(p_password) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  update carts set owner_password_hash = app_hash(p_password) where id = s.cart_id;
  return json_build_object('status','ok');
end; $$;
grant execute on function app_change_owner_password(uuid, text) to anon;

-- Owner sets/resets a staff member's password (staff must be in their cart).
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
  return json_build_object('status','ok');
end; $$;
grant execute on function app_set_staff_password(uuid, bigint, text) to anon;

-- Owner registers a new staff member (insert + password in one authorised call,
-- so the row + hash land together — no client-side insert of the hash column).
create or replace function app_register_staff(p_token uuid, p_id bigint, p_name text, p_mobile text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s app_sessions;
begin
  s := app_session(p_token);
  if s.role is null or s.role <> 'owner' then return json_build_object('status','error','message','Not authorised'); end if;
  if length(p_password) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  if exists (select 1 from staff where mobile = p_mobile) then return json_build_object('status','error','message','That mobile is already registered'); end if;
  insert into staff(id, cart_id, name, mobile, password_hash, active) values (p_id, s.cart_id, p_name, p_mobile, app_hash(p_password), true);
  return json_build_object('status','ok','id',p_id,'cart_id',s.cart_id,'name',p_name,'mobile',p_mobile,'active',true);
end; $$;
grant execute on function app_register_staff(uuid, bigint, text, text, text) to anon;

-- Admin resets a cart owner's password (authorised by admin session token).
create or replace function app_admin_reset_owner(p_token uuid, p_cart_id text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s app_sessions;
begin
  s := app_session(p_token);
  if s.role is null or s.role <> 'admin' then return json_build_object('status','error','message','Not authorised'); end if;
  if length(p_password) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  update carts set owner_password_hash = app_hash(p_password) where id = p_cart_id;
  return json_build_object('status','ok');
end; $$;
grant execute on function app_admin_reset_owner(uuid, text, text) to anon;

-- ── Migration: corn cheese stock ──
-- Safe to run on databases created before corn cheese was added.
alter table day_close_logs add column if not exists expected_corn integer;
alter table day_close_logs add column if not exists actual_corn integer;
alter table day_close_logs add column if not exists corn_diff integer;

-- ── Migration: pending payment + staff accounts ──
-- Allow the new 'pending' payment status and record when an order is settled.
alter table orders add column if not exists settled_at timestamptz;
alter table orders add column if not exists cancel_reason text;
alter table orders drop constraint if exists orders_payment_check;
alter table orders add constraint orders_payment_check check (payment in ('cash', 'upi', 'pending', 'cancelled'));

-- ── Migration: multi-cart (which QSR cart an order belongs to) ──
alter table orders add column if not exists outlet text;
alter table orders add column if not exists outlet_name text;

-- ── Migration: multi-tenant cart_id on every per-cart table ──
-- Tags existing single-tenant rows with the seed momowala cart.
alter table orders add column if not exists cart_id text;
alter table stock_logs add column if not exists cart_id text;
alter table cart_loadings add column if not exists cart_id text;
alter table day_close_logs add column if not exists cart_id text;
alter table staff add column if not exists cart_id text;
update orders        set cart_id = 'momowala' where cart_id is null;
update stock_logs    set cart_id = 'momowala' where cart_id is null;
update cart_loadings set cart_id = 'momowala' where cart_id is null;
update day_close_logs set cart_id = 'momowala' where cart_id is null;
update staff         set cart_id = 'momowala' where cart_id is null;

-- staff.role is no longer used (role is implied by table); keep the column
-- nullable so old inserts don't break, but drop the NOT NULL + check.
alter table staff alter column role drop not null;
alter table staff drop constraint if exists staff_role_check;

-- ── Migration: owner name on carts ──
alter table carts add column if not exists owner_name text;
alter table carts add column if not exists phone text;
alter table carts add column if not exists instagram text;
alter table carts add column if not exists logo text;
alter table carts add column if not exists upi_id text;
alter table carts add column if not exists upi_qr text;
alter table carts add column if not exists open_time text;
alter table carts add column if not exists close_time text;
alter table carts add column if not exists closed_manually boolean default false;
alter table carts add column if not exists default_prep_mins integer;
