-- Apply the complete file atomically; the final section replaces legacy permissions.
begin;
-- Reapplying the bootstrap must flush derived-report triggers before later ALTER TABLE statements.
set constraints all immediate;
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
-- One user action, one transaction and receipt. Existing APK commands remain supported.
create or replace function public.app_mutate_batch(p_id uuid,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); who text; prior app_private.operations;
 cmd jsonb; r jsonb; results jsonb:='[]'; n int:=0; child uuid; cid text; k text; v jsonb; inv jsonb;
begin
 if s.role is null then raise exception 'Sign in required' using errcode='42501'; end if;
 who:=concat_ws(':',s.role,s.cart_id,s.name);
 if jsonb_typeof(p_commands) is distinct from 'array' or jsonb_array_length(p_commands) not between 1 and 100 then raise exception 'Invalid change batch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into prior from app_private.operations where id=p_id;
 if found then
  if prior.actor<>who then raise exception 'Not authorised' using errcode='42501'; end if;
  return prior.result;
 end if;
 for cmd in select value from jsonb_array_elements(p_commands) loop
  n:=n+1; child:=md5(p_id::text||':'||n::text)::uuid;
  if cmd->>'kind'='row' and cmd->'payload'->>'table'='day_close_logs' then
   cid:=cmd->'payload'->'after'->>'cart_id';
   if not app_private.allowed(cid,array['admin','owner']) then raise exception 'Not authorised' using errcode='42501'; end if;
   perform pg_advisory_xact_lock(hashtextextended(cid||':'||(cmd->'payload'->'after'->>'date'),2));
   if exists(select 1 from day_close_logs where cart_id=cid and date=(cmd->'payload'->'after'->>'date')::date and id<>(cmd->'payload'->'after'->>'id')::bigint) then
    raise exception 'This day was already reconciled on another phone. Reload saved data before continuing.';
   end if;
  end if;
  if cmd->>'kind'='inventory' then
   cid:=cmd->'payload'->>'cartId';
   if not app_private.allowed(cid) then raise exception 'Not authorised' using errcode='42501'; end if;
   select data->cid into inv from inventory where id=1 for update;
   for k,v in select * from jsonb_each(cmd->'payload'->'ops') loop
    if v ? 'cset' and (inv->k->'cart') is distinct from (cmd->'payload'->'expected'->k->'cart') then raise exception 'Cart stock changed on another phone. Refresh and recount.'; end if;
    if v ? 'fset' and (inv->k->'freezer') is distinct from (cmd->'payload'->'expected'->k->'freezer') then raise exception 'Freezer stock changed on another phone. Refresh and recount.'; end if;
    if coalesce((v->>'fset')::numeric,coalesce((inv->k->>'freezer')::numeric,0)+coalesce((v->>'df')::numeric,0))<0 or
       coalesce((v->>'cset')::numeric,coalesce((inv->k->>'cart')::numeric,0)+coalesce((v->>'dc')::numeric,0))<0 then
      raise exception 'Not enough stock. Refresh before moving or discarding stock.';
    end if;
   end loop;
  end if;
  r:=app_mutate(child,cmd->>'kind',cmd->'payload');
  if r->>'status' is distinct from 'ok' then raise exception '%',coalesce(r->>'message','Change could not be saved'); end if;
  results:=results||jsonb_build_array(r);
 end loop;
 r:=jsonb_build_object('status','ok','results',results);
 insert into app_private.operations(id,actor,result) values(p_id,who,r);
 return r;
end $$;
revoke all on function public.app_mutate_batch(uuid,jsonb) from public,authenticated;
grant execute on function public.app_mutate_batch(uuid,jsonb) to anon;
notify pgrst,'reload schema';

-- Manager assignment is independent of editable staff profiles and checked on every load.
create table if not exists public.cart_opening_managers (
 cart_id text primary key references public.carts(id), staff_id bigint references public.staff(id) on delete set null,
 revision bigint not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.opening_manager_audit (
 id bigint generated always as identity primary key, cart_id text not null,
 previous_staff_id bigint, staff_id bigint, actor_role text not null, actor_name text,
 created_at timestamptz not null default now()
);
create table if not exists public.opening_alerts (
 id bigint generated always as identity primary key, cart_id text not null references public.carts(id),
 business_date date not null, kind text not null check(kind in ('completed','missed','manager_reminder')),
 staff_id bigint, title text not null, body text not null,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(cart_id,business_date,kind)
);
alter table public.cart_opening_managers enable row level security;
alter table public.opening_manager_audit enable row level security;
alter table public.opening_alerts enable row level security;
revoke all on public.cart_opening_managers,public.opening_manager_audit,public.opening_alerts from public,anon,authenticated;
grant select on public.cart_opening_managers,public.opening_manager_audit,public.opening_alerts to anon;
drop policy if exists scoped_read on public.cart_opening_managers;
create policy scoped_read on public.cart_opening_managers for select to anon using(app_private.allowed(cart_id));
drop policy if exists scoped_read on public.opening_manager_audit;
create policy scoped_read on public.opening_manager_audit for select to anon using(app_private.allowed(cart_id,array['owner','admin']));
drop policy if exists scoped_read on public.opening_alerts;
create policy scoped_read on public.opening_alerts for select to anon using(kind<>'manager_reminder' and app_private.allowed(cart_id,array['owner','admin']));

create or replace function public.app_assign_opening_manager(p_cart_id text,p_staff_id bigint,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); r cart_opening_managers;
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 select * into r from cart_opening_managers where cart_id=p_cart_id;
 if coalesce(r.revision,0) is distinct from p_revision then return jsonb_build_object('status','conflict','message','Manager assignment changed on another phone. Reload and try again.'); end if;
 if p_staff_id is not null and not exists(select 1 from staff where id=p_staff_id and cart_id=p_cart_id and active) then raise exception 'Choose an active staff member from this cart'; end if;
 if r.staff_id is not distinct from p_staff_id then return jsonb_build_object('status','ok'); end if;
 insert into opening_manager_audit(cart_id,previous_staff_id,staff_id,actor_role,actor_name) values(p_cart_id,r.staff_id,p_staff_id,s.role,s.name);
 insert into cart_opening_managers(cart_id,staff_id) values(p_cart_id,p_staff_id)
 on conflict(cart_id) do update set staff_id=excluded.staff_id,revision=cart_opening_managers.revision+1,updated_at=now();
 return jsonb_build_object('status','ok');
end $$;

create or replace function public.app_opening_status(p_cart_id text,p_date date)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); m record; assignment cart_opening_managers; r opening_loads;
begin
 if not app_private.allowed(p_cart_id) then raise exception 'Not authorised' using errcode='42501'; end if;
 select * into assignment from cart_opening_managers where cart_id=p_cart_id;
 select id,name,active into m from staff where id=assignment.staff_id and cart_id=p_cart_id;
 select * into r from opening_loads where cart_id=p_cart_id and business_date=p_date;
 return jsonb_build_object('record',case when r.cart_id is null then null else to_jsonb(r) end,
 'managerId',assignment.staff_id,'managerName',m.name,'managerActive',coalesce(m.active,false),'revision',coalesce(assignment.revision,0),
 'canLoad',coalesce(s.role='staff' and s.staff_id=m.id and m.active,false));
end $$;

create or replace function public.app_read_opening_alert(p_id bigint)
returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 update opening_alerts set read_at=coalesce(read_at,now()) where id=p_id and kind<>'manager_reminder' and app_private.allowed(cart_id,array['owner','admin']);
end $$;

alter table public.push_subscriptions add column if not exists staff_id bigint;
create or replace function public.app_identity() returns jsonb
language sql stable security definer set search_path=public,app_private as $$
 select jsonb_build_object('role',s.role,'cartId',s.cart_id,'name',s.name,'staffId',s.staff_id,'expiresAt',extract(epoch from s.expires_at)*1000) from app_private.session() s;
$$;

-- Events survive offline phones. A per-endpoint lease permits retries without losing
-- successful deliveries when another device fails. Provider acknowledgments are not reads.
create table if not exists app_private.opening_deliveries (
 alert_id bigint not null references public.opening_alerts(id) on delete cascade, endpoint text not null,
 lease uuid, retry_at timestamptz not null default now(), sent_at timestamptz, attempts int not null default 0,
 primary key(alert_id,endpoint)
);
alter table app_private.opening_deliveries enable row level security;
revoke all on app_private.opening_deliveries from public,anon,authenticated;

create or replace function app_private.collect_opening_alerts(p_now timestamptz)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare c record; d date; opens timestamptz; loaded opening_loads; manager record;
begin
 -- Include tomorrow for midnight openings whose reminder starts today.
 for c in select * from carts where active and open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' loop
  for d in select ((p_now at time zone 'Asia/Kolkata')::date+i) from generate_series(0,1) i loop
   opens:=(d+c.open_time::time) at time zone 'Asia/Kolkata';
   if p_now<opens-interval '30 minutes' then continue; end if;
   perform pg_advisory_xact_lock(hashtextextended(c.id||':'||d::text,2));
   select * into loaded from opening_loads where cart_id=c.id and business_date=d;
   select t.id,t.name into manager from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active where m.cart_id=c.id;
   if loaded.cart_id is null or loaded.created_at>opens then
    if p_now<opens and manager.id is not null and loaded.cart_id is null then
     insert into opening_alerts(cart_id,business_date,kind,staff_id,title,body)
     values(c.id,d,'manager_reminder',manager.id,c.name||': opening stock due','Load opening stock before '||c.open_time||' IST. The owner will be alerted if it is still missing at opening.')
     on conflict(cart_id,business_date,kind) do update set staff_id=excluded.staff_id where opening_alerts.staff_id is distinct from excluded.staff_id;
    elsif p_now>=opens then
     insert into opening_alerts(cart_id,business_date,kind,staff_id,title,body)
     values(c.id,d,'missed',manager.id,c.name||': opening stock missing',coalesce(manager.name,'No active manager assigned')||' — opening stock was not submitted by '||c.open_time||' IST. Please follow up.') on conflict do nothing;
    end if;
   end if;
  end loop;
 end loop;
end $$;
revoke all on function app_private.collect_opening_alerts(timestamptz) from public,anon,authenticated;

create or replace function public.app_claim_opening_notifications()
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 perform app_private.collect_opening_alerts(now());
 insert into app_private.opening_deliveries(alert_id,endpoint)
 select a.id,s.endpoint from opening_alerts a join push_subscriptions s on s.cart_id=a.cart_id
 where a.created_at>now()-interval '1 day' and
 ((a.kind<>'manager_reminder' and s.role='owner') or (a.kind='manager_reminder' and s.role='staff' and s.staff_id=a.staff_id))
 on conflict do nothing;
 with due as (
  select d.alert_id,d.endpoint from app_private.opening_deliveries d
  join opening_alerts a on a.id=d.alert_id join carts c on c.id=a.cart_id and c.active join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=a.cart_id
  where d.sent_at is null and d.retry_at<=now() and a.created_at>now()-interval '1 day'
  and ((a.kind<>'manager_reminder' and s.role='owner') or
   (a.kind='manager_reminder' and s.role='staff' and s.staff_id=a.staff_id
    and c.open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and now() < ((a.business_date+c.open_time::time) at time zone 'Asia/Kolkata')
    and exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.active where m.cart_id=a.cart_id and m.staff_id=a.staff_id)
    and not exists(select 1 from opening_loads l where l.cart_id=a.cart_id and l.business_date=a.business_date)))
  order by a.id limit 20 for update of d skip locked
 ), claimed as (
  update app_private.opening_deliveries d set lease=gen_random_uuid(),retry_at=now()+interval '2 minutes',attempts=attempts+1
  from due where d.alert_id=due.alert_id and d.endpoint=due.endpoint returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'lease',d.lease,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'title',a.title,'body',a.body,'kind',a.kind)), '[]') into result
 from claimed d join opening_alerts a on a.id=d.alert_id join push_subscriptions s on s.endpoint=d.endpoint;
 return result;
end $$;

create or replace function public.app_finish_opening_notification(p_id bigint,p_endpoint text,p_lease uuid,p_sent boolean,p_dead boolean default false)
returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 update app_private.opening_deliveries set sent_at=case when p_sent or p_dead then now() else null end,
 retry_at=now()+least(attempts,30)*interval '1 minute',lease=null where alert_id=p_id and endpoint=p_endpoint and lease=p_lease;
 if found and p_dead then delete from push_subscriptions where endpoint=p_endpoint; end if;
end $$;
revoke all on function public.app_assign_opening_manager(text,bigint,bigint),public.app_opening_status(text,date),public.app_read_opening_alert(bigint),public.app_claim_opening_notifications(),public.app_finish_opening_notification(bigint,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.app_assign_opening_manager(text,bigint,bigint),public.app_opening_status(text,date),public.app_read_opening_alert(bigint),public.app_claim_opening_notifications(),public.app_finish_opening_notification(bigint,text,uuid,boolean,boolean) to anon;

create or replace function public.app_load_opening_inventory(p_cart_id text,p_date date,p_operation_id uuid,p_quantities jsonb)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); existing opening_loads; blob jsonb; ci jsonb; k text; qty jsonb; n numeric; f numeric; c numeric; today date:=(now() at time zone 'Asia/Kolkata')::date; tomorrow_open timestamp; expected_date date;
begin
 if not app_private.allowed(p_cart_id,array['staff']) then raise exception 'Not authorised: only the assigned manager can load opening stock' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 if not exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active where m.cart_id=p_cart_id and m.staff_id=s.staff_id) then
  raise exception 'Only the assigned active manager can load opening stock' using errcode='42501';
 end if;
 perform 1 from staff where id=s.staff_id and active for share;
 if not found then raise exception 'Manager account is no longer active' using errcode='42501'; end if;
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
 insert into opening_alerts(cart_id,business_date,kind,staff_id,title,body)
 select p_cart_id,p_date,'completed',s.staff_id,name||': opening stock loaded',s.name||' loaded '||(select sum(value::numeric) from jsonb_each_text(p_quantities))::text||' pieces. View the saved quantities in Stock.' from carts where id=p_cart_id
 on conflict do nothing;
 return jsonb_build_object('status','ok','record',to_jsonb(existing),'cartInv',ci);
end $$;
revoke all on function public.app_load_opening_inventory(text,date,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.app_load_opening_inventory(text,date,uuid,jsonb) to anon;
notify pgrst,'reload schema';

create or replace function public.app_claim_opening_notifications()
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 perform app_private.collect_opening_alerts(now());
 insert into app_private.opening_deliveries(alert_id,endpoint)
 select a.id,s.endpoint from opening_alerts a join push_subscriptions s on s.cart_id=a.cart_id
 where a.created_at>now()-interval '1 day' and
 (((a.kind<>'manager_reminder' and s.role='owner') or (a.kind='completed' and s.endpoint like 'fcm:%' and s.role='staff' and s.staff_id=a.staff_id)) or (a.kind='manager_reminder' and s.role='staff' and s.staff_id=a.staff_id))
 on conflict do nothing;
 with due as (
  select d.alert_id,d.endpoint from app_private.opening_deliveries d
  join opening_alerts a on a.id=d.alert_id join carts c on c.id=a.cart_id and c.active join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=a.cart_id
  where d.sent_at is null and d.retry_at<=now() and a.created_at>now()-interval '1 day'
  and (((a.kind<>'manager_reminder' and s.role='owner') or (a.kind='completed' and s.endpoint like 'fcm:%' and s.role='staff' and s.staff_id=a.staff_id)) or
   (a.kind='manager_reminder' and s.role='staff' and s.staff_id=a.staff_id
    and c.open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and now() < ((a.business_date+c.open_time::time) at time zone 'Asia/Kolkata')
    and exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.active where m.cart_id=a.cart_id and m.staff_id=a.staff_id)
    and not exists(select 1 from opening_loads l where l.cart_id=a.cart_id and l.business_date=a.business_date)))
  order by a.id limit 20 for update of d skip locked
 ), claimed as (
  update app_private.opening_deliveries d set lease=gen_random_uuid(),retry_at=now()+interval '2 minutes',attempts=attempts+1
  from due where d.alert_id=due.alert_id and d.endpoint=due.endpoint returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'lease',d.lease,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'title',a.title,'body',a.body,'kind',a.kind,'cartId',a.cart_id,'date',a.business_date,'mode',case when a.kind='completed' and s.role='staff' then 'stock_complete' else 'alert' end)), '[]') into result
 from claimed d join opening_alerts a on a.id=d.alert_id join push_subscriptions s on s.endpoint=d.endpoint;
 return result;
end $$;


revoke all on function public.app_claim_opening_notifications() from public,authenticated;
grant execute on function public.app_claim_opening_notifications() to anon;
notify pgrst,'reload schema';

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

-- Per-item server records avoid clobbering another phone's unrelated ticks.
create table if not exists public.daily_packing (
 cart_id text not null references public.carts(id), business_date date not null,
 item_id text not null check(length(item_id) between 1 and 128), checked boolean not null,
 updated_at timestamptz not null default now(), primary key(cart_id,business_date,item_id)
);
alter table public.daily_packing enable row level security;
revoke all on public.daily_packing from public,anon,authenticated;
grant select on public.daily_packing to anon;
drop policy if exists daily_packing_read on public.daily_packing;
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

-- Owner-configured manager closing workflow.
-- Closing counts are a manager handover, not a second revenue/stock mutation.
create table if not exists public.cart_closing_settings (
 cart_id text primary key references public.carts(id), enabled boolean not null default false,
 closing_time time not null default '22:00', revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table if not exists public.closing_reports (
 id bigint generated always as identity primary key, cart_id text not null references public.carts(id),
 business_date date not null, due_at timestamptz not null, stock_types jsonb not null,
 cash_count numeric(12,2), quantities jsonb, notes text, submitted_by bigint, submitted_name text,
 submitted_at timestamptz, operation_id uuid unique, owner_read_at timestamptz,
 unique(cart_id,business_date)
);
create table if not exists app_private.closing_deliveries (
 report_id bigint not null references public.closing_reports(id), endpoint text not null,
 tag text not null, mode text not null, staff_id bigint, manager_revision bigint, config_revision bigint,
 lease uuid, retry_at timestamptz not null default now(), sent_at timestamptz,
 primary key(report_id,endpoint,tag)
);
alter table public.cart_closing_settings enable row level security;
alter table public.closing_reports enable row level security;
alter table app_private.closing_deliveries enable row level security;
revoke all on public.cart_closing_settings,public.closing_reports,app_private.closing_deliveries from public,anon,authenticated;
grant select on public.cart_closing_settings to anon;
drop policy if exists scoped_read on public.cart_closing_settings;
create policy scoped_read on public.cart_closing_settings for select to anon using(app_private.allowed(cart_id) or app_private.backend());
-- All report access passes through checked RPCs. Other staff cannot read counts.
create or replace function app_private.closing_manager(p_cart text) returns boolean language sql stable security definer set search_path=public,app_private as $$
 select coalesce(exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active
 where m.cart_id=p_cart and m.staff_id=(app_private.session()).staff_id) and app_private.allowed(p_cart,array['staff']),false);
$$;
create or replace function public.app_save_closing_settings(p_cart_id text,p_enabled boolean,p_time text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare r cart_closing_settings;
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_enabled is null or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose a valid closing time'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 select * into r from cart_closing_settings where cart_id=p_cart_id;
 if coalesce(r.revision,0) is distinct from p_revision then raise exception 'Closing settings changed. Reload and retry.'; end if;
 if p_enabled and not exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active where m.cart_id=p_cart_id) then raise exception 'Assign an active cart manager first'; end if;
 insert into cart_closing_settings(cart_id,enabled,closing_time) values(p_cart_id,p_enabled,p_time::time)
 on conflict(cart_id) do update set enabled=excluded.enabled,closing_time=excluded.closing_time,revision=cart_closing_settings.revision+1,updated_at=now() returning * into r;
 return to_jsonb(r);
end $$;
create or replace function app_private.collect_closing_reports(p_now timestamptz,p_cart text default null)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare c record; d date; due timestamptz; items jsonb;
begin
 for c in select s.* from cart_closing_settings s join carts cart on cart.id=s.cart_id and cart.active where s.enabled and (p_cart is null or s.cart_id=p_cart) loop
  -- Catch a missed midnight cron run, without creating historical reports before enablement.
  for d in select (p_now at time zone 'Asia/Kolkata')::date-i from generate_series(0,1) i loop
   due:=(d+c.closing_time) at time zone 'Asia/Kolkata';
   if due>p_now or due<c.updated_at then continue; end if;
   select coalesce(data->c.cart_id->'stockTypes','[]'::jsonb) into items from menus where id=1;
   insert into closing_reports(cart_id,business_date,due_at,stock_types) values(c.cart_id,d,due,coalesce(items,'[]')) on conflict do nothing;
  end loop;
 end loop;
end $$;
create or replace function public.app_closing_status(p_cart_id text)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare cfg cart_closing_settings; reports jsonb; manager boolean;
begin
 manager:=app_private.closing_manager(p_cart_id);
 if not manager and not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Only the cart manager or owner can access closing reports' using errcode='42501'; end if;
 perform app_private.collect_closing_reports(now(),p_cart_id);
 select * into cfg from cart_closing_settings where cart_id=p_cart_id;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.business_date desc),'[]') into reports from
 (select * from closing_reports where cart_id=p_cart_id and (submitted_at is null or owner_read_at is null or business_date>=(now() at time zone 'Asia/Kolkata')::date-60)) r;
 return jsonb_build_object('settings',case when cfg.cart_id is null then jsonb_build_object('enabled',false,'closing_time','22:00:00','revision',0) else to_jsonb(cfg) end, 'canSubmit',manager,'managerRevision',(select revision from cart_opening_managers where cart_id=p_cart_id),'reports',reports,'serverNow',now());
end $$;
create or replace function public.app_submit_closing(p_cart_id text,p_report_id bigint,p_operation_id uuid,p_cash numeric,p_quantities jsonb,p_notes text default '')
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare r closing_reports; s app_sessions:=app_private.session(); item jsonb; n numeric; keys int;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 if not app_private.closing_manager(p_cart_id) then raise exception 'Only the assigned active manager can submit closing' using errcode='42501'; end if;
 perform 1 from staff where id=s.staff_id and active for share;
 if not found then raise exception 'Manager account is inactive'; end if;
 select * into r from closing_reports where id=p_report_id and cart_id=p_cart_id for update;
 if not found then raise exception 'Closing report not found'; end if;
 if r.submitted_at is not null then
  if r.operation_id=p_operation_id and r.cash_count=p_cash and r.quantities=p_quantities and r.notes=coalesce(p_notes,'') then return to_jsonb(r); end if;
  raise exception 'Closing already submitted. Reload to view the saved report.';
 end if;
 if not exists(select 1 from cart_closing_settings where cart_id=p_cart_id and enabled) then raise exception 'Closing workflow is disabled'; end if;
 if now()<r.due_at then raise exception 'Closing is not due yet'; end if;
 if p_operation_id is null or p_cash is null or p_cash<0 or p_cash>10000000 or p_cash<>round(p_cash,2) then raise exception 'Enter a valid cash count (up to two decimals)'; end if;
 if p_quantities is null or jsonb_typeof(p_quantities)<>'object' or length(coalesce(p_notes,''))>1000 then raise exception 'Enter all stock counts and a note under 1000 characters'; end if;
 select count(*) into keys from jsonb_object_keys(p_quantities);
 if keys<>jsonb_array_length(r.stock_types) then raise exception 'Count every stock item'; end if;
 for item in select value from jsonb_array_elements(r.stock_types) loop
  if not p_quantities ? (item->>'key') or jsonb_typeof(p_quantities->(item->>'key'))<>'number' then raise exception 'Count every stock item'; end if;
  n:=(p_quantities->>(item->>'key'))::numeric;
  if n<0 or n>100000 or n<>trunc(n) then raise exception 'Stock counts must be whole pieces, zero or more'; end if;
 end loop;
 update closing_reports set cash_count=p_cash,quantities=p_quantities,notes=coalesce(p_notes,''),submitted_by=s.staff_id,submitted_name=s.name,submitted_at=now(),operation_id=p_operation_id where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
create or replace function public.app_ack_closing(p_cart_id text,p_report_id bigint) returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 if not app_private.allowed(p_cart_id,array['owner','admin']) then raise exception 'Not authorised' using errcode='42501'; end if;
 update closing_reports set owner_read_at=coalesce(owner_read_at,now()) where id=p_report_id and cart_id=p_cart_id and submitted_at is not null;
 if not found then raise exception 'Submitted closing report not found'; end if;
end $$;
create or replace function public.app_claim_closing_notifications() returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare result jsonb;
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 perform app_private.collect_closing_reports(now());
 -- Each assignment revision gets its own alert identity. Reassignment cancels old phones.
 insert into app_private.closing_deliveries(report_id,endpoint,tag,mode,staff_id,manager_revision,config_revision)
 select r.id,s.endpoint,'closing-manager-'||r.id||'-'||m.revision||'-'||cfg.revision,'closing_due',m.staff_id,m.revision,cfg.revision
 from closing_reports r join cart_closing_settings cfg on cfg.cart_id=r.cart_id and cfg.enabled
 join carts c on c.id=r.cart_id and c.active
 join cart_opening_managers m on m.cart_id=r.cart_id join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active
 join push_subscriptions s on s.cart_id=r.cart_id and s.role='staff' and s.staff_id=m.staff_id
 where r.submitted_at is null on conflict do nothing;
 insert into app_private.closing_deliveries(report_id,endpoint,tag,mode)
 select r.id,s.endpoint,'closing-owner-'||r.id,'closing_report' from closing_reports r join push_subscriptions s on s.cart_id=r.cart_id and s.role='owner'
 where r.submitted_at is not null and r.owner_read_at is null on conflict do nothing;
 update app_private.closing_deliveries d set mode='closing_stop',sent_at=null,retry_at=now(),lease=null
 from closing_reports r where r.id=d.report_id and d.mode<>'closing_stop' and
 ((d.mode='closing_report' and r.owner_read_at is not null) or (d.mode='closing_due' and
 (r.submitted_at is not null or not exists(select 1 from cart_closing_settings cfg join carts c on c.id=cfg.cart_id and c.active
 join cart_opening_managers m on m.cart_id=cfg.cart_id join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active
 where cfg.cart_id=r.cart_id and cfg.enabled and m.staff_id=d.staff_id and m.revision=d.manager_revision and cfg.revision=d.config_revision))));
 with due as (
 select d.report_id,d.endpoint,d.tag from app_private.closing_deliveries d join closing_reports r on r.id=d.report_id
 join push_subscriptions s on s.endpoint=d.endpoint and s.cart_id=r.cart_id
 where (d.sent_at is null or (d.mode<>'closing_stop' and d.sent_at<now()-interval '5 minutes')) and d.retry_at<=now() and (d.mode='closing_stop' or (d.mode='closing_report' and s.role='owner') or (d.mode='closing_due' and s.role='staff' and s.staff_id=d.staff_id))
 order by (d.mode='closing_stop') desc,r.due_at limit 50 for update of d skip locked
 ), claimed as (
 update app_private.closing_deliveries d set lease=gen_random_uuid(),retry_at=now()+interval '2 minutes' from due
 where (d.report_id,d.endpoint,d.tag)=(due.report_id,due.endpoint,due.tag) returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'lease',d.lease,'tag',d.tag,'mode',d.mode,'cartId',r.cart_id,'date',r.business_date,
 'title',case when d.mode='closing_due' then c.name||': submit closing counts' else c.name||': closing report' end,
 'body',case when d.mode='closing_due' then 'Count cash and remaining stock. Ringing stops after your report is saved.' else coalesce(r.submitted_name,'Manager')||' submitted closing. Open Reconcile to review and acknowledge.' end)),'[]') into result
 from claimed d join closing_reports r on r.id=d.report_id join carts c on c.id=r.cart_id join push_subscriptions s on s.endpoint=d.endpoint;
 return result;
end $$;
create or replace function public.app_finish_closing_notification(p_id bigint,p_endpoint text,p_tag text,p_lease uuid,p_sent boolean,p_dead boolean default false)
returns void language plpgsql security definer set search_path=public,app_private as $$
begin
 if not app_private.backend() then raise exception 'Not authorised' using errcode='42501'; end if;
 update app_private.closing_deliveries set sent_at=case when p_sent or p_dead then now() else null end,retry_at=now()+interval '1 minute',lease=null
 where report_id=p_id and endpoint=p_endpoint and tag=p_tag and lease=p_lease;
 if found and p_dead then delete from push_subscriptions where endpoint=p_endpoint; end if;
end $$;
revoke all on function app_private.closing_manager(text),app_private.collect_closing_reports(timestamptz,text) from public,anon,authenticated;
revoke all on function public.app_save_closing_settings(text,boolean,text,bigint),public.app_closing_status(text),public.app_submit_closing(text,bigint,uuid,numeric,jsonb,text),public.app_ack_closing(text,bigint),public.app_claim_closing_notifications(),public.app_finish_closing_notification(bigint,text,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.app_save_closing_settings(text,boolean,text,bigint),public.app_closing_status(text),public.app_submit_closing(text,bigint,uuid,numeric,jsonb,text),public.app_ack_closing(text,bigint),public.app_claim_closing_notifications(),public.app_finish_closing_notification(bigint,text,text,uuid,boolean,boolean) to anon;
notify pgrst,'reload schema';

-- Daily stock and manager identity (20261019081525)
-- Manager identity is derived from the single authoritative assignment, never a client flag.
alter table public.staff add column if not exists is_manager boolean not null default false;
create or replace function app_private.staff_manager_flag() returns trigger
language plpgsql security definer set search_path=public,app_private as $$
begin
 new.is_manager:=new.active and exists(select 1 from cart_opening_managers where cart_id=new.cart_id and staff_id=new.id);
 return new;
end $$;
drop trigger if exists staff_manager_flag on public.staff;
create trigger staff_manager_flag before insert or update on public.staff for each row execute function app_private.staff_manager_flag();
create or replace function app_private.refresh_manager_flags() returns trigger
language plpgsql security definer set search_path=public,app_private as $$
begin
 update staff set is_manager=is_manager where cart_id=coalesce(new.cart_id,old.cart_id);
 return null;
end $$;
drop trigger if exists refresh_manager_flags on public.cart_opening_managers;
create trigger refresh_manager_flags after insert or update or delete on public.cart_opening_managers for each row execute function app_private.refresh_manager_flags();
update public.staff set is_manager=is_manager;
grant select(is_manager) on public.staff to anon;
revoke all on function app_private.staff_manager_flag(),app_private.refresh_manager_flags() from public,anon,authenticated;

-- Match the existing 30-minute preparation window for carts opening just after midnight.
create or replace function app_private.stock_business_date(p_cart text,p_now timestamptz default now()) returns date
language sql stable security definer set search_path=public,app_private as $$
 select case when (p_now at time zone 'Asia/Kolkata') >= ((p_now at time zone 'Asia/Kolkata')::date+1+coalesce(nullif(c.open_time,''),'16:00')::time)-interval '30 minutes'
 then (p_now at time zone 'Asia/Kolkata')::date+1 else (p_now at time zone 'Asia/Kolkata')::date end from carts c where c.id=p_cart;
$$;
create table if not exists app_private.inventory_days(cart_id text primary key references public.carts(id),business_date date not null);
alter table app_private.inventory_days enable row level security;
create table if not exists public.cart_stock_rollovers(
 cart_id text not null references public.carts(id),business_date date not null,next_business_date date not null,
 quantities jsonb not null,reset_at timestamptz not null default now(),primary key(cart_id,business_date)
);
alter table public.cart_stock_rollovers enable row level security;
revoke all on app_private.inventory_days,public.cart_stock_rollovers from public,anon,authenticated;
grant select on public.cart_stock_rollovers to anon;
drop policy if exists scoped_read on public.cart_stock_rollovers;
create policy scoped_read on public.cart_stock_rollovers for select to anon using(app_private.allowed(cart_id,array['owner','admin']));
-- Preserve today's live inventory at rollout; automatic resets begin on the next business day.
insert into app_private.inventory_days select id,app_private.stock_business_date(id) from public.carts on conflict(cart_id) do nothing;
create or replace function app_private.roll_stock_day(p_cart text) returns void
language plpgsql security definer set search_path=public,app_private as $$
declare d date:=app_private.stock_business_date(p_cart); previous date; blob jsonb; ci jsonb; k text; v jsonb; counts jsonb:='{}';
begin
 if d is null then return; end if;
 -- Fast read path, then recheck under the same inventory row lock used by every stock mutation.
 select business_date into previous from app_private.inventory_days where cart_id=p_cart;
 if previous>=d then return; end if;
 select data into blob from inventory where id=1 for update;
 if not found then return; end if;
 select business_date into previous from app_private.inventory_days where cart_id=p_cart;
 if previous>=d then return; end if;
 if previous is not null then
  ci:=coalesce(blob->p_cart,'{}');
  for k,v in select * from jsonb_each(ci) loop
   if k<>'consumables' and jsonb_typeof(v)='object' and v ? 'cart' then
    counts:=counts||jsonb_build_object(k,v->'cart');
    ci:=jsonb_set(ci,array[k,'cart'],'0'::jsonb);
   end if;
  end loop;
  insert into cart_stock_rollovers(cart_id,business_date,next_business_date,quantities) values(p_cart,previous,d,counts) on conflict do nothing;
  update inventory set data=jsonb_set(blob,array[p_cart],ci,true),updated_at=now() where id=1;
 end if;
 insert into app_private.inventory_days values(p_cart,d) on conflict(cart_id) do update set business_date=excluded.business_date;
end $$;
create or replace function app_private.roll_all_stock_days() returns void
language plpgsql security definer set search_path=public,app_private as $$
declare cid text;
begin
 for cid in select id from carts order by id loop perform app_private.roll_stock_day(cid); end loop;
end $$;
create or replace function public.app_inventory() returns jsonb
language plpgsql volatile security definer set search_path=public,app_private as $$
declare cid text;
begin
 for cid in select id from carts where app_private.allowed(id) order by id loop perform app_private.roll_stock_day(cid); end loop;
 return coalesce((select jsonb_object_agg(e.key,e.value) from inventory i,jsonb_each(i.data) e where app_private.allowed(e.key)),'{}'::jsonb);
end $$;
revoke all on function app_private.stock_business_date(text,timestamptz),app_private.roll_stock_day(text),app_private.roll_all_stock_days() from public,anon,authenticated;
-- Daily rollover also runs with all phones closed. Reads/writes provide an atomic fallback.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('cartlyft-daily-stock','* * * * *','select app_private.roll_all_stock_days()');
 end if;
end $$;

do $migration$
declare definition text; target text; replacement text;
begin
 definition:=pg_get_functiondef('app_private.inventory_delta(text,jsonb)'::regprocedure);
 target:=' insert into inventory(id,data)';
 if position(target in definition)=0 then raise exception 'inventory_delta integration point missing'; end if;
 definition:=replace(definition,target,E' perform app_private.roll_stock_day(p_cart);\n'||target);
 execute definition;
 definition:=pg_get_functiondef('public.app_load_opening_inventory(text,date,uuid,jsonb)'::regprocedure);
 target:=' select data into blob from inventory where id=1 for update;';
 if position(target in definition)=0 then raise exception 'opening integration point missing'; end if;
 execute replace(definition,target,E' perform app_private.roll_stock_day(p_cart_id);\n'||target);
 definition:=pg_get_functiondef('public.app_mutate_batch(uuid,jsonb)'::regprocedure);
 target:='   select data->cid into inv from inventory where id=1 for update;';
 if position(target in definition)=0 then raise exception 'batch integration point missing'; end if;
 execute replace(definition,target,E'   perform app_private.roll_stock_day(cid);\n'||target);
end $migration$;

-- Attribute deductions to the stock day so cancelling old orders cannot resurrect yesterday's food.
alter table public.orders add column if not exists stock_business_date date;
update public.orders set stock_business_date=date where stock_deducted and stock_business_date is null;
do $migration$
declare definition text; target text;
begin
 definition:=pg_get_functiondef('app_private.write_order(jsonb)'::regprocedure);
 target:='   newrow.items:=app_private.price_items(cid,a->''items'');';
 if position(target in definition)=0 then raise exception 'order edit integration point missing'; end if;
 definition:=replace(definition,target,E'   if old.stock_deducted and old.stock_business_date is distinct from app_private.stock_business_date(cid) then raise exception ''Start a new order for today’s items; this order belongs to an earlier stock day.''; end if;\n'||target);
 target:=' perform app_private.inventory_delta(cid,ops);';
 if position(target in definition)=0 then raise exception 'order stock integration point missing'; end if;
 definition:=replace(definition,target,E' if coalesce(old.stock_deducted,false) and old.stock_business_date is distinct from app_private.stock_business_date(cid) then ops:=''{}''; end if;\n newrow.stock_business_date:=case when newrow.stock_deducted and not coalesce(old.stock_deducted,false) then app_private.stock_business_date(cid) else old.stock_business_date end;\n'||target);
 target:='stock_deducted=newrow.stock_deducted,stock_usage=newrow.stock_usage';
 if position(target in definition)=0 then raise exception 'order date integration point missing'; end if;
 definition:=replace(definition,target,'stock_business_date=newrow.stock_business_date,'||target);
 execute definition;
end $migration$;

create or replace function public.app_opening_status(p_cart_id text,p_date date) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); m record; assignment cart_opening_managers; r opening_loads; d date;
begin
 if not app_private.allowed(p_cart_id) then raise exception 'Not authorised' using errcode='42501'; end if;
 d:=app_private.stock_business_date(p_cart_id);
 perform app_private.roll_stock_day(p_cart_id);
 select * into assignment from cart_opening_managers where cart_id=p_cart_id;
 select id,name,active into m from staff where id=assignment.staff_id and cart_id=p_cart_id;
 select * into r from opening_loads where cart_id=p_cart_id and business_date=coalesce(p_date,d);
 return jsonb_build_object('businessDate',d,'record',case when r.cart_id is null then null else to_jsonb(r) end,
 'managerId',assignment.staff_id,'managerName',m.name,'managerActive',coalesce(m.active,false),'revision',coalesce(assignment.revision,0),
 'isManager',coalesce(s.role='staff' and s.staff_id=m.id and m.active,false),
 'canLoad',coalesce(s.role='staff' and s.staff_id=m.id and m.active,false));
end $$;
notify pgrst,'reload schema';

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

begin;
create table if not exists app_private.stock_refills (
 operation_id uuid primary key,cart_id text not null references public.carts(id),business_date date not null,
 staff_id bigint not null references public.staff(id),category text not null,quantity integer not null check(quantity>0),
 log_id bigint not null,created_at timestamptz not null default now()
);
alter table app_private.stock_refills enable row level security;
revoke all on app_private.stock_refills from public,anon,authenticated;
create or replace function public.app_refill_stock(p_cart_id text,p_date date,p_operation_id uuid,p_category text,p_quantity integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare s app_sessions:=app_private.session();prior app_private.stock_refills;blob jsonb;ci jsonb;f numeric;c numeric;logid bigint;
begin
 if not app_private.allowed(p_cart_id,array['staff']) then raise exception 'Only the assigned manager can refill stock' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id,17));
 if not exists(select 1 from cart_opening_managers m join staff t on t.id=m.staff_id and t.cart_id=m.cart_id and t.active where m.cart_id=p_cart_id and m.staff_id=s.staff_id) then raise exception 'Only the assigned active manager can refill stock' using errcode='42501'; end if;
 perform 1 from staff where id=s.staff_id and active for share;
 if not found then raise exception 'Manager account is inactive' using errcode='42501'; end if;
 if p_operation_id is null then raise exception 'Refill reference required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,92));
 select * into prior from app_private.stock_refills where operation_id=p_operation_id;
 if found then
  if prior.cart_id is distinct from p_cart_id or prior.staff_id is distinct from s.staff_id or prior.business_date is distinct from p_date or prior.category is distinct from p_category or prior.quantity is distinct from p_quantity then raise exception 'Refill reference already used for another request'; end if;
  return jsonb_build_object('status','ok','record',to_jsonb(prior));
 end if;
 if p_date is distinct from app_private.stock_business_date(p_cart_id) then raise exception 'Reload before refilling a new business day'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cart_id||':'||p_date::text,2));
 if not exists(select 1 from opening_loads where cart_id=p_cart_id and business_date=p_date) then raise exception 'Submit today''s opening stock before refilling'; end if;
 if p_category is null or p_quantity is null or p_quantity<=0 or p_quantity>100000 then raise exception 'Choose a category and positive whole-piece quantity'; end if;
 if not exists(select 1 from menus m cross join lateral jsonb_array_elements(coalesce(m.data->p_cart_id->'stockTypes','[]')) t where m.id=1 and t->>'key'=p_category) then raise exception 'Unknown stock category'; end if;
 perform app_private.roll_stock_day(p_cart_id);
 select data into blob from inventory where id=1 for update;
 ci:=blob->p_cart_id;
 if ci is null or not ci ? p_category or p_category='consumables' then raise exception 'Stock category is unavailable'; end if;
 f:=coalesce((ci->p_category->>'freezer')::numeric,0);c:=coalesce((ci->p_category->>'cart')::numeric,0);
 if p_quantity>f then raise exception 'Not enough freezer stock for this refill'; end if;
 ci:=jsonb_set(ci,array[p_category],(ci->p_category)||jsonb_build_object('freezer',f-p_quantity,'cart',c+p_quantity));
 update inventory set data=jsonb_set(blob,array[p_cart_id],ci,true),updated_at=now() where id=1;
 logid:=nextval('app_private.opening_log_id');
 insert into cart_loadings(id,cart_id,date,time,type,item,qty,note) values(logid,p_cart_id,p_date,to_char(now() at time zone 'Asia/Kolkata','HH24:MI'),'CART_LOAD',p_category,p_quantity,'Manager refill · '||coalesce(s.name,'manager'));
 insert into app_private.stock_refills(operation_id,cart_id,business_date,staff_id,category,quantity,log_id) values(p_operation_id,p_cart_id,p_date,s.staff_id,p_category,p_quantity,logid) returning * into prior;
 return jsonb_build_object('status','ok','record',to_jsonb(prior));
end $$;
revoke all on function public.app_refill_stock(text,date,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.app_refill_stock(text,date,uuid,text,integer) to anon;
notify pgrst,'reload schema';
commit;

create or replace function app_private.collect_closing_reports(p_now timestamptz,p_cart text default null)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare c record; d date; due timestamptz; items jsonb;
begin
 for c in select s.* from cart_closing_settings s join carts cart on cart.id=s.cart_id and cart.active where s.enabled and (p_cart is null or s.cart_id=p_cart) loop
  -- Include the configuration day even when enabled after the scheduled hour.
  -- Do not create historical reports for dates before enablement/update.
  for d in select (p_now at time zone 'Asia/Kolkata')::date-i from generate_series(0,1) i loop
   due:=(d+c.closing_time) at time zone 'Asia/Kolkata';
   if due>p_now or d<(c.updated_at at time zone 'Asia/Kolkata')::date then continue; end if;
   select coalesce(data->c.cart_id->'stockTypes','[]'::jsonb) into items from menus where id=1;
   insert into closing_reports(cart_id,business_date,due_at,stock_types) values(c.cart_id,d,due,coalesce(items,'[]')) on conflict do nothing;
  end loop;
 end loop;
end $$;

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
