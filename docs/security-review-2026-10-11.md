# Security and synchronization review — 11 October 2026

Fixed the identified critical/high issues and deployed the matching frontend, APIs and database migration.

- Removed unrestricted anonymous reads/writes of private operational data. Server-validated application sessions enforce tenant and role scope. Public catalog responses omit owner account identifiers and credentials.
- Disabled unauthenticated first-time password claims and legacy browser authentication fallback. Password changes invalidate affected sessions; login/recovery attempts are throttled.
- Replaced whole cached-state uploads with durable commands, UUID receipts and changed-field conflict checks. Offline staff writes survive reload/network failures; rejected changes stay visible.
- Made order insertion, token allocation and stock accounting transactional. Concurrent settlements deduct stock once. Prices and quantities are validated against the database menu.
- Persisted preparation/acknowledgment changes. Customer success requires a server-confirmed order.
- Protected push registration, notification claims, menu extraction and scheduled endpoints. Configured the database to recognize the existing server secret without exposing it to browsers.
- Updated vulnerable dependencies; full `npm audit` reports zero vulnerabilities.

## Verification

18 automated tests passed: 9 API/outbox tests and 9 PostgreSQL integration tests, including simultaneous settlements, response-loss retries, cross-tenant access, stale edits and disabled staff. The database suite also passed against a newly initialized local cluster using the complete baseline schema. Production build and whitespace checks passed.

Local browser checks covered owner menu editing, staff ordering/preparation, QR customer confirmation, and offline staff ordering followed by reconnection. Live checks covered catalog/menu loading, protected routing/API denials, anonymous database isolation, and server-secret access. Purchase/stock-changing tests used disposable local data, not live customer orders. An owner-scope read check in production was rolled back.

Production retained 4,137 orders, 8 staff, the identical inventory checksum, and both active scheduler jobs across migration. No existing passwords were reset.

## Remaining maintenance and operator action

Refresh open cart phones after rollout. One existing owner account has no password; the platform admin must set it using the authenticated reset control.

The legacy project-wide lint gate still fails on unused bindings, React hook checks and fast-refresh organization. The build emits a large-bundle warning. These are not clean gates and are not represented as passing.

Supabase's advisor still flags deliberate checked SECURITY DEFINER entry points because custom sessions use the anon database role. Protected internal tables deliberately have no public RLS policy. Review context: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy . The existing pg_net extension placement warning remains; scheduler configuration was preserved: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public .

Existing password hash compatibility remains SHA-256; migration to a dedicated authentication provider or stronger password hashing is a separate hardening task. This review fixes the identified issues, not a guarantee that the entire system is vulnerability-free.
