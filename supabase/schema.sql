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

-- Owner + staff accounts. The owner row is seeded by the app; staff are
-- added by the owner. Passwords are stored as SHA-256 hashes, never plain.
create table if not exists staff (
  id bigint primary key,
  name text not null,
  mobile text not null unique,
  password_hash text,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  active boolean not null default true,
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

-- drop-then-create so the whole file is safe to re-run
drop policy if exists "anon full access" on orders;
drop policy if exists "anon full access" on stock_logs;
drop policy if exists "anon full access" on cart_loadings;
drop policy if exists "anon full access" on day_close_logs;
drop policy if exists "anon full access" on inventory;
drop policy if exists "anon full access" on staff;

create policy "anon full access" on orders for all to anon using (true) with check (true);
create policy "anon full access" on stock_logs for all to anon using (true) with check (true);
create policy "anon full access" on cart_loadings for all to anon using (true) with check (true);
create policy "anon full access" on day_close_logs for all to anon using (true) with check (true);
create policy "anon full access" on inventory for all to anon using (true) with check (true);
create policy "anon full access" on staff for all to anon using (true) with check (true);

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
