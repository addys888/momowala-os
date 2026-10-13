-- The shipped day-close serializer includes this nullable reconciliation flag.
-- Keep historical records unchanged; existing RPC role/cart checks still apply.
alter table public.day_close_logs add column if not exists unrecorded boolean;
notify pgrst, 'reload schema';
