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
  payment text not null check (payment in ('cash', 'upi', 'pending')),
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
  phone text,
  instagram text,
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
  foreach t in array array['orders','stock_logs','cart_loadings','day_close_logs','inventory','staff','carts','platform','menus']
  loop
    execute format('drop policy if exists "anon full access" on %I', t);
    execute format('create policy "anon full access" on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ── Migration: corn cheese stock ──
-- Safe to run on databases created before corn cheese was added.
alter table day_close_logs add column if not exists expected_corn integer;
alter table day_close_logs add column if not exists actual_corn integer;
alter table day_close_logs add column if not exists corn_diff integer;

-- ── Migration: pending payment + staff accounts ──
-- Allow the new 'pending' payment status and record when an order is settled.
alter table orders add column if not exists settled_at timestamptz;
alter table orders drop constraint if exists orders_payment_check;
alter table orders add constraint orders_payment_check check (payment in ('cash', 'upi', 'pending'));

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
