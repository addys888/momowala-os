-- Older installations created orders before split payment support. CREATE TABLE
-- IF NOT EXISTS did not upgrade them; app_private.order_change needs this field
-- even when validating a cash/UPI order. Preserve all existing rows.
alter table public.orders add column if not exists split jsonb;
notify pgrst, 'reload schema';
