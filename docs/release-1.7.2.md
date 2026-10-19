# Cartlyft Partner 1.7.2 — 19 October 2026

User explicitly approved building and publishing these changes. Version code 14; existing package/signing certificate retained. Minimum supported release remains code 12.

- Server-derived staff `is_manager` follows assignment and active status. Manager badges appear beside the staff name and in the owner registry.
- Assigned managers receive the opening-stock modal when the server has no submission for the current business day. A confirmed submission closes it across sessions/phones for that day. Saved quantities and remaining food are available in the staff Stock tab; wastage remains there too.
- Daily food rollover runs on the server through pg_cron and atomic read/write fallbacks. Leftovers are archived, food cart counts reset, freezer/consumables remain unchanged, and concurrent opening submissions cannot double-load. Old-order cancellations cannot restore yesterday's discarded stock.

Live migration: `20261019082153_daily_stock_and_manager_identity` (local source `20261019081525_daily_stock_and_manager_identity.sql`). Verified Sumit is the active Momo Wala manager and the daily cron is enabled.

Authorized one-time correction: Momo Wala's 19 October opening submission was veg 400, paneer 250, corn 25. Ledger reconciliation identified prior carryover of veg 202, paneer 129, corn 32. Removed only that carryover under the inventory lock and archived it in cart_stock_rollovers for 18 → 19 October. Immediately verified remaining food: veg 390, paneer 250, corn 25 (two existing sales consumed 10 veg). Freezer stock, orders, opening submission, reports and consumables were preserved. No test orders were created in production.

Validation: 37 unit checks, 35 isolated database tests, and 37 UI checks each on Android 7 and Android 15 passed. Database coverage includes permissions, reassignment, concurrent reset/load, preserved freezer/supplies, and old-order cancellation. UI coverage includes failed submissions, confirmed modal dismissal, server-date changes, manager labels and Stock access. Signed release APK/AAB and Android lint passed; certificate matches earlier releases. This release was not separately exercised on a physical phone; prior FCM delivery verification limitations remain.

Security advisor reviewed: private inventory_days intentionally has deny-by-default RLS; existing custom-session RPC notices and public pg_net extension warning remain. References: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy and https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public and https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable . This is not a new full security audit.

APK: /downloads/cartlyft-1.7.2.apk
Bytes: 3976191
SHA-256: cd42aa3beb7a298c60b4924fa1caddc6116ab5f59f3ab7549771ec8286cc94f2

Published deployment `dpl_9yGwYmdNMfDCL8rgjtDDZw4Jg16j` to https://momowala-os.vercel.app. Public update endpoint reports version 1.7.2/code 14, minimum 12. Installation page verified; downloaded public APK matches the byte count and SHA-256 above.
