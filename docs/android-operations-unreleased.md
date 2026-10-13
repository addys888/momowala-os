# Android operations upgrade — release status

Release 1.2.0 / code 4 explicitly authorized by the user on 13 October 2026. The opening inventory migration is deployed. Remaining features below are excluded from this release. Future APK releases still require explicit authorization.

## Included in 1.2.0

- Branded accessible startup screen, reduced-motion support and slow-connection retry.
- Removed duplicate native toolbar. Authenticated screens provide one responsive Cartlyft header and an App settings action.
- Native opening reminder 30 minutes before the owner's opening time, IST business dates, including midnight rollover. Local persisted AlarmManager scheduling, reboot/time change rescheduling, immutable intents, private notifications, ringing/vibration subject to Android settings, permission setup, and device assignment that survives logout/session expiry without retaining a login token. Explicit unassignment is available from staff settings and the logged-out App settings menu; switching carts requires unassignment.
- Staff/owner opening stock form: one server transaction transfers requested pieces from freezer to cart, appends stock audit logs and records completion. Positive whole quantities only; insufficient stock fails atomically. Per-cart/day uniqueness and stable operation IDs protect retries and concurrent devices. Pending/failed writes do not complete the reminder.
- Confirmation received on this phone cancels the notification. Server reads refresh while the component is mounted. Owner top-ups use existing controls only after the day's opening transfer.
- Logout warns when Day Close is missing. It does not silently certify reconciliation or invent closing stock.
- Native commands require the main WebView plus trusted source and current top-level HTTPS origin. Payloads are bounded; no session tokens cross the bridge. Receivers are not exported. RawBT intents target the official package, preserving receipt bytes.

## Remaining integration work (not included in 1.2.0)

1. Firebase project/app setup. Google authentication succeeded and the user approved a new Cartlyft project. Creation of `cartlyft-momowala` reached the add-Firebase step but Google returned HTTP 403 PERMISSION_DENIED, including on retry. Firebase lists no projects; the underlying Cloud project state remains unverified. The console also failed to load its terms acceptance status. Resolve account/project access before retrying the same ID; do not create duplicate projects. No billing was enabled.
2. FCM registration per staff/device, server-authorized subscriptions, token rotation/revocation, and server completion/schedule-change messages. This is essential to cancel alarms on other phones while their apps are closed and propagate changed opening times. Current local reminders use the last synchronized schedule and cannot learn a remote change offline.
3. Native closing-time reminders and a complete staff closing-count/reconciliation flow. Current work adds a logout reminder only. Preserve owner reconciliation authority.
4. Server-side device enrollment and owner revocation. The user explicitly approved alarms after logout; local persistence and explicit unassignment are implemented. Remote enrollment/revocation still depends on the messaging integration.
5. Physical Android 7 and modern Android/OEM tests: lock screen, vibration/audio, denied permissions, battery saver/Doze, reboot, force-stop, stale staff assignment, muted channels, and multi-device completion. Force-stop, device-off, DND and user permission controls cannot be bypassed or guaranteed away.
6. Additional file-picker validation, native secure session storage design, retention policy and crash/observability integration. The baseline review is not certification.

The architecture remains a hybrid app: shared React screens plus native platform services. This iteration is not a complete Kotlin/Compose screen rewrite or demonstrated feature parity with Zomato Partner.

## Validation completed

- 16 JavaScript unit/API tests; 15 isolated PostgreSQL tests.
- Java clock tests: pre-opening timing, repeat scheduling, acknowledgement and midnight/year rollover.
- Android debug build and lint (zero errors); Android 7 instrumentation: real scheduled notification, completion cancellation, logout-independent assignment, cross-cart reassignment rejection, explicit unassignment, RawBT package/byte checks, external scheme restrictions.
- Mobile browser against isolated PostgreSQL: staff login, opening form, successful stock transfer and visible server-confirmed quantities. No real production stock was altered.
- Android 7 login visually checked without duplicate toolbar. Signed in-place upgrade from 1.1.1 to 1.2.0 verified on the Android 7 emulator.

Run `npm test`, `TEST_PG_PORT=55441 npm run test:db` after isolated setup, and `JAVA_HOME=... npm run check:android`. Internal debug output stays under ignored Android build directories and is never copied to public downloads.

Baseline security report: see `docs/android-security-review.md`. The low-severity implicit RawBT handler finding is addressed on this release branch and covered by the device routing test. New reminder code received a separate implementation review; it is outside the sealed baseline security scan.
