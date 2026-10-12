-- Apply the complete file atomically; the final section replaces legacy permissions.
begin;
-- ============================================
-- MOMO WALA OS — Supabase schema
-- Run this once in the Supabase dashboard:
-- SQL Editor → New query → paste → Run
-- ============================================

-- Every sale (staff entry or customer QR order). ids come from the app
-- (Date.now()); checked commands manage subsequent updates.
create table if not exists orders (
  id bigint primary key,
  token text not null,
  date date not null,
  time text not null,
  items jsonb not null default '[]',
  total integer not null,
  payment text not null check (payment in ('cash', 'upi', 'split', 'pending', 'cancelled', 'zomato', 'swiggy')),
  split jsonb,   -- for payment='split': { cash, upi } — the two must sum to total
  cancel_reason text,
  prep_status text,
  staff text,
  source text,
  settled_at timestamptz,
  customer_name text,
  customer_phone text,
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
  stock jsonb,            -- generic per-stock-type reconciliation [{key,label,expected,actual,diff}]
  holiday boolean,        -- cart never opened that day (nothing to reconcile)
  unrecorded boolean,     -- cart ran but no orders were punched; money entered by hand
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
  fund text,          -- 'cart' (Kotak/UPI earnings) | 'personal' (Axis credit)
  inserted_at timestamptz not null default now()
);
-- back-fill the funding-source column on existing installs
alter table expenses add column if not exists fund text;

-- Owner's weekly Zomato/Swiggy payout validation flags. One row per cart per
-- ISO week (Mon–Sun). id = week-start as YYYYMMDD int. `received` toggles as the
-- owner ticks each week off against the platform's weekly payout statement.
-- MENU WRITE LOCKDOWN. The July 2026 clobbers came from devices running old
-- app builds (kept open for days, never reloaded) background-pushing their
-- stale whole-menu blob — no client-side fix can reach a device that never
-- reloads. So writes are locked at the database: menu edits go through this
-- SECURITY DEFINER function that rewrites ONLY the named cart's menu, and
-- anon loses direct INSERT/UPDATE on menus entirely — a stale build's direct
-- upsert is rejected by Postgres itself. The history trigger still snapshots
-- every change made through the function.
create or replace function set_cart_menu(p_cart_id text, p_menu jsonb)
returns void language plpgsql security definer as $$
begin
  update menus
     set data = jsonb_set(coalesce(data, '{}'::jsonb), array[p_cart_id], p_menu, true),
         updated_at = now()
   where id = 1;
  if not found then
    insert into menus (id, data, updated_at) values (1, jsonb_build_object(p_cart_id, p_menu), now());
  end if;
end $$;
grant execute on function set_cart_menu(text, jsonb) to anon;
revoke insert, update, delete on menus from anon;  -- reads stay open; writes only via the function

-- Safety net for the menus blob: every write to menus is snapshotted BEFORE it
-- lands, so any accidental overwrite (the July 2026 "menu items vanished"
-- incident) can be rolled back by copying a row back from here. Insert-only
-- for the browser role; nothing in the app reads it.
create table if not exists menus_history (
  id bigserial primary key,
  snapshot jsonb not null,
  replaced_at timestamptz not null default now()
);
alter table menus_history enable row level security;  -- no anon policy ⇒ browser can't read/change history
create or replace function snapshot_menus() returns trigger
language plpgsql security definer as $$
begin
  insert into menus_history (snapshot) values (to_jsonb(old));
  return new;
end $$;
drop trigger if exists menus_history_trg on menus;
create trigger menus_history_trg before update on menus
  for each row execute function snapshot_menus();

create table if not exists payout_marks (
  id bigint primary key,
  cart_id text,
  week_start date not null,
  received boolean not null default true,
  updated_at timestamptz not null default now()
);
grant all on payout_marks to anon;

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

-- ── Atomic inventory updates ──
-- Inventory is a single JSON blob shared by every device. Writing the whole blob
-- (last-write-wins) let the owner's "load to cart" and the staff's order
-- deductions clobber each other (lost loads, negative cart counts). These
-- SECURITY DEFINER funcs apply *deltas* under a row lock, so concurrent changes
-- from different devices compose correctly.
-- p_ops: { "<stockKey>": { "df": int, "dc": int } }  -- deltas to freezer/cart
--        use "fset"/"cset" for an absolute value (e.g. day-close empties cart).
create or replace function apply_inventory(p_cart_id text, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare blob jsonb; cartinv jsonb; k text; op jsonb; f numeric; c numeric; cur jsonb;
begin
  select data into blob from inventory where id = 1 for update;
  if blob is null then blob := '{}'::jsonb; end if;
  cartinv := coalesce(blob -> p_cart_id, '{}'::jsonb);
  for k, op in select key, value from jsonb_each(p_ops) loop
    cur := coalesce(cartinv -> k, jsonb_build_object('freezer', 0, 'cart', 0));
    f := coalesce((cur ->> 'freezer')::numeric, 0);
    c := coalesce((cur ->> 'cart')::numeric, 0);
    if op ? 'fset' then f := (op ->> 'fset')::numeric; else f := f + coalesce((op ->> 'df')::numeric, 0); end if;
    if op ? 'cset' then c := (op ->> 'cset')::numeric; else c := c + coalesce((op ->> 'dc')::numeric, 0); end if;
    if f < 0 then f := 0; end if;            -- physical stock can't go negative
    if c < 0 then c := 0; end if;
    cartinv := jsonb_set(cartinv, array[k], jsonb_build_object('freezer', f, 'cart', c), true);
  end loop;
  blob := jsonb_set(blob, array[p_cart_id], cartinv, true);
  update inventory set data = blob, updated_at = now() where id = 1;
  return cartinv;
end; $$;
grant execute on function apply_inventory(text, jsonb) to anon;

-- Owner-only consumables (oil, cheese, French fries…) — low concurrency, so a
-- whole-sub-object set is fine; still atomic via the row lock.
create or replace function set_cart_consumables(p_cart_id text, p_cons jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare blob jsonb; cartinv jsonb;
begin
  select data into blob from inventory where id = 1 for update;
  if blob is null then blob := '{}'::jsonb; end if;
  cartinv := coalesce(blob -> p_cart_id, '{}'::jsonb);
  cartinv := jsonb_set(cartinv, array['consumables'], p_cons, true);
  blob := jsonb_set(blob, array[p_cart_id], cartinv, true);
  update inventory set data = blob, updated_at = now() where id = 1;
  return cartinv;
end; $$;
grant execute on function set_cart_consumables(text, jsonb) to anon;

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
alter table payout_marks enable row level security;

-- drop-then-create so the whole file is safe to re-run
do $$
declare t text;
begin
  foreach t in array array['orders','stock_logs','cart_loadings','day_close_logs','inventory','staff','carts','menus','wastage_logs','expenses','order_counters','payout_marks']
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
declare adm record; r record; tok uuid; exp timestamptz := now() + interval '24 hours';
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
declare tok uuid; exp timestamptz := now() + interval '24 hours';
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

-- ── Admin self-serve "forgot password" via a recovery code ──
-- The admin sets a recovery code once (while logged in); if they later forget
-- their password, entering that code lets them set a new one without any SQL.
-- The code is stored only as a salted hash (app_hash), and app_admin_recover is
-- gated by it — an attacker with the public anon key still needs the code.
alter table platform add column if not exists admin_recovery_hash text;

-- Admin sets/updates their recovery code (authorised by their session token).
create or replace function app_admin_set_recovery(p_token uuid, p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s app_sessions;
begin
  s := app_session(p_token);
  if s.role is null or s.role <> 'admin' then return json_build_object('status','error','message','Not authorised'); end if;
  if length(coalesce(p_code, '')) < 4 then return json_build_object('status','error','message','Recovery code must be at least 4 characters'); end if;
  update platform set admin_recovery_hash = app_hash(p_code) where id = 1;
  return json_build_object('status','ok');
end; $$;
grant execute on function app_admin_set_recovery(uuid, text) to anon;

-- Forgot-password: reset the admin password using the recovery code. Verifies the
-- mobile + code, then sets a new password and returns a fresh session token.
create or replace function app_admin_recover(p_mobile text, p_code text, p_new_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare adm record; tok uuid; exp timestamptz := now() + interval '24 hours';
begin
  select admin_mobile, admin_recovery_hash into adm from platform where id = 1;
  if adm.admin_mobile is null or adm.admin_mobile <> p_mobile then return json_build_object('status','not_registered'); end if;
  if adm.admin_recovery_hash is null then return json_build_object('status','no_recovery'); end if;
  if adm.admin_recovery_hash <> app_hash(coalesce(p_code, '')) then return json_build_object('status','bad_code'); end if;
  if length(coalesce(p_new_password, '')) < 4 then return json_build_object('status','error','message','Password must be at least 4 characters'); end if;
  update platform set admin_password_hash = app_hash(p_new_password) where id = 1;
  insert into app_sessions(role, expires_at) values ('admin', exp) returning token into tok;
  return json_build_object('status','ok','role','admin','token',tok,'expiresAt', extract(epoch from exp)*1000);
end; $$;
grant execute on function app_admin_recover(text, text, text) to anon;

-- ── Migration: corn cheese stock ──
-- Safe to run on databases created before corn cheese was added.
alter table day_close_logs add column if not exists expected_corn integer;
alter table day_close_logs add column if not exists actual_corn integer;
alter table day_close_logs add column if not exists corn_diff integer;
-- Generic per-stock-type reconciliation (replaces the hardcoded veg/paneer/corn cols).
alter table day_close_logs add column if not exists stock jsonb;
-- How the day was closed: holiday = cart never opened; unrecorded = it ran but
-- no orders were punched, so the money was entered by hand. Without these the
-- flags only lived on the device that set them and were lost on cloud reload.
alter table day_close_logs add column if not exists holiday boolean;
alter table day_close_logs add column if not exists unrecorded boolean;

-- ── Migration: pending payment + staff accounts ──
-- Allow the new 'pending' payment status and record when an order is settled.
alter table orders add column if not exists settled_at timestamptz;
alter table orders add column if not exists cancel_reason text;
-- Customer contact captured on QR self-orders (light anti-abuse + lets staff
-- identify/call the customer). Nullable; client tolerates their absence.
alter table orders add column if not exists customer_name text;
alter table orders add column if not exists customer_phone text;
-- Live prep status for the customer tracker: null=placed, 'preparing', 'ready'.
alter table orders add column if not exists prep_status text;
-- Split (part-cash / part-UPI) payments: the breakdown rides in a jsonb column.
alter table orders add column if not exists split jsonb;
-- Set when staff Accepts or Rejects an incoming customer (QR) order. While it is
-- null on a pending qr-order, the phones keep ringing (api/cron/pending-alerts).
alter table orders add column if not exists acknowledged_at timestamptz;
-- The repeat-alert cron scans today's unacknowledged pending QR orders.
create index if not exists orders_pending_ack_idx
  on orders (date, payment, acknowledged_at);
alter table orders drop constraint if exists orders_payment_check;
alter table orders add constraint orders_payment_check check (payment in ('cash', 'upi', 'split', 'pending', 'cancelled', 'zomato', 'swiggy'));

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
do $$ begin if exists(select 1 from information_schema.columns where table_schema='public' and table_name='staff' and column_name='role') then alter table staff alter column role drop not null; end if; end $$;
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


-- Current security and synchronization model (also shipped as an incremental migration).
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

commit;
