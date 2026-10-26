# Partner 1.8.0 (23)

Orders and other changes now await server confirmation before appearing as saved. Account bootstrap reads cart-scoped data in one database request without the REST row limit. Local snapshots do not supply saved business records; pending command recovery remains durable until acknowledged by the server.

Unrelated failed edits no longer block queued orders. Retried orders reuse their IDs. Recovered prior-day sales retain their original dates and do not deduct today's fresh inventory. Existing opening-stock records were not changed.

A server-backed notification bell shows cart activity and owner announcements. Read status is stored per account. Owner notifications remain informational; manager opening/closing alarms are unchanged. Native notification taps support the inbox destination.

## Validation

- Application tests: 44 passed.
- Existing database tests: 43 passed.
- Partner server tests: 5 passed, including 1,105-row bootstrap, cart/role isolation, announcements/read state, backend-only push claims, and prior-day recovery.
- Browser fixture checks: stale local orders excluded; both staff visible to owner; inbox navigation and announcement submission; delayed save waits for receipt; rejected save retains one recovery request and retry saves exactly one order.
- Partner-only production web build passed. Signed release APK assembly and Android release lint passed. Android 7 minimum retained. Signing certificate matches prior releases.
- Two partner migrations applied to production. No test orders or announcements submitted to production.

## Limits and recovery

Pending orders on a physical phone cannot be recovered remotely. Install this release over the existing app, sign in to the same account, keep it online and retry sync. Do not uninstall or clear storage. Confirm recovered orders under their original business date. Real phone recovery and native push delivery are not yet verified; browser fixtures do not replace physical device testing. Emulator testing was unavailable due to disk capacity.

Existing Supabase advisories remain for custom-session SECURITY DEFINER RPCs and the public extension. New inbox tables deny direct access and expose guarded RPCs. No claim of a clean project-wide security audit is made.

APK SHA-256: 18d1e4b504f676a926915685d5638e703f208b74be45c77c529417100d5e71ca
