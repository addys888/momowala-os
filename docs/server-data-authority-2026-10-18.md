# Server-owned business data — 18 October 2026

## Fixed

- Application boot now uses an empty business state, not hard-coded cart/menu/stock examples or unscoped phone snapshots. Authenticated screens require a successful scoped Supabase load; connection/identity failures show a retry state rather than silently operating from old data. Login still renders independently.
- Account changes reset in-memory business state before loading the next account. Business snapshots are no longer written back to browser storage. The destructive legacy data-epoch reset was removed; existing report/order snapshots remain untouched for recovery.
- A rejected edit no longer overlays a newer server order. The original command is retained; new unsynced orders stay visible as drafts. This does not automatically resolve conflicting business decisions or replay them over server values.
- Packing completion now lives in Supabase `daily_packing`, scoped by cart, business date and item. Reads refresh every 12 seconds while visible. UI changes only after a successful server response; independent item changes do not replace the whole checklist.
- Existing phone checklist ticks can be explicitly imported. Import only fills absent server items and cannot overwrite a newer true/false value. Reconciliation labels distinguish pending reports from confirmed reports.

## What remains local

Session and device settings, customer convenience preferences, the durable unsent-command queue and recovery copies. Commands keep their operation IDs for retry deduplication. They are not a replacement for committed server records. After a successful initial load, brief network outages can still queue local edits; these are pending until Supabase confirms them.

Legacy raw snapshot copies are preserved but not automatically uploaded as truth. Existing recovery operations retain their original IDs. Rejected edits still require review; the old Retry sync action cannot resolve a genuine conflicting business decision by itself.

## Backend and security

Applied additive migration `server_daily_packing` to Supabase project `ljurgzzimnspqnyrbaky`; existing business rows were not rewritten or deleted. Verified RLS is enabled, anonymous direct writes are denied, and the authenticated-session RPC enforces cart ownership and current business date. The app uses its existing custom session mechanism; the anon-executable SECURITY DEFINER advisor warning is expected for this guarded RPC. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). Other existing advisor notices (private tables without direct policies, pg_net in public) remain outside this patch.

## Validation and build

- 37 application tests passed, including rejection merge behavior.
- 28 isolated PostgreSQL tests passed, including anonymous/staff/cross-cart write rejection, independent item saves, import preservation, date validation and denied direct writes.
- 8 startup/failure tests passed on Android 7 and Android 15, including failed-server gating and legacy report preservation.
- 27 partner UI checks passed on Android 15, including server packing restoration on remount and failed-save behavior.
- Internal Android debug build/lint/schedule checks passed. No public APK/version or web deployment was changed.

The new checklist has not yet been exercised through two physical phones against production. Existing installed APKs keep their previous behavior until an approved release. Production schema is ready; local APK is an internal debug build and uses a different signing certificate from public releases.

## Release status — 19 October 2026
These changes are now included in public signed APK 1.7.0 (code 12), following explicit user release approval. The internal-build statements above describe the original development validation.
