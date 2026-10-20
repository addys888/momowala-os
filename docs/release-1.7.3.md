# Cartlyft Partner 1.7.3 — 20 October 2026

Explicit user approval to build and publish. Android version code 15, same package and signing certificate; minimum required code remains 12.

- Fix first-time Configure closing: null composite settings now receive explicit defaults on the server and defensive defaults in the UI. Editing retains its original revision to prevent overwriting another phone's settings.
- Replace native alert audio with the supplied zomato_dum_dum_fire.mp3. Existing vibration, continuous playback, acknowledgment/submission behavior and Android channel preferences remain. Physical-speaker volume is not verified.
- Show staff a full-page What's new once per installed release and staff/cart on a device, before loading the staff home screen. Only acknowledged versions are remembered; upcoming features are not shown on older APKs.
- Add server-calculated daily operating profit, gated on confirmed manager closing or owner/admin reconciliation. Sold ingredient rates: veg 3, paneer 5, corn 5 rupees per piece. Fixed daily rent/electricity + labour = 950. Other supplies total 1150 for a reference sale of 500 veg + 300 paneer + 40 corn = 840 pieces. Each supply line scales by sold reference-category pieces / 840, rounded to paise. Half quantity gives oil 100 and cream 50; no sales gives zero variable costs. All rates, fixed/variable lines and reference quantities are owner-configurable per cart. Default costs seed Momo Wala only, effective 20 October.
- Sold costs determine profit; unsold, returned and wasted stock values are separate. Existing purchase expenses are not deducted again. Source order quantities are stored snapshots. Cost snapshots remain fixed for closed reports; later payment corrections refresh report revisions. Missing/manual-only sales data prevents misleading finalized profit.

Live migrations applied: closing_settings_defaults and daily_operating_profit. Verified Momo Wala live seed: fixed 950, variable reference 1150, reference quantities 500/300/40. No real orders or closing submissions were created for tests, and no live closing schedules were enabled.

43 isolated database tests and 37 unit tests passed. Android debug and signed release APK/AAB builds and lint passed. Android 7 UI scenarios passed. Initial Android 15 instrumentation returned a completed result but its process hit the runner timeout while the release build was active; a clean rerun is recorded below before publication. Both instrumentation suites check that the packaged MP3 decodes. Original signing certificate verified.

APK bytes: 4141423
SHA-256: 576a454e93a4747389231854e627f6f409d0bc5bdefccc9815c8995b45954c28

Publication verified: deployment dpl_38MSNCuLkM2L3qQpLq5zSmGduUM9 promoted to https://momowala-os.vercel.app. Public install page and update endpoint advertise 1.7.3/code 15; public APK download matches the SHA-256 above. Minimum required version remains 12.

Clean Android 15 rerun passed all 39 UI scenarios; Android 7 also passed all 39. A separate signed in-place upgrade simulator could not start because the host had insufficient disk space. Signature continuity was verified, but an actual signed in-place upgrade was not tested for this release. Physical speaker loudness and live two-phone background delivery remain unverified.

Security advisor reviewed. Custom-session public RPCs are intentionally callable through anon but authorize internally; new cost/profit APIs enforce owner/admin cart scope. Existing pg_net extension placement warning remains: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public . Private deny-by-default table notices remain intentional. This release does not claim a fresh exhaustive security audit or physical two-phone FCM delivery certification.
