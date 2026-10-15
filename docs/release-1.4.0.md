# Cartlyft Partner 1.4.0

Public release requested by the owner on 14 October 2026. Android version code 6, minimum Android 7 (API 24), existing production signing certificate retained.

Includes manager-controlled daily stock loading, owner completion/missed-loading alerts, Firebase native background notifications with acknowledgment, and atomic cross-phone stock/reconciliation changes. Owners must assign an active manager in Staff → Registry & activity → Cart manager before opening stock can be submitted. No staff is promoted automatically.

Validation: 33 application/API tests and 25 isolated database tests passed; signed APK and AAB generation and release lint passed. The APK certificate matches 1.3.0. Previous native testing verified real Android 15 background delivery and acknowledgment, plus Android 7 local alarm/notification instrumentation.

Remaining limits: physical Android 7 live push and audible/haptic behavior require phone verification. Android notification permission, volume, DND and delivery restrictions apply. Acknowledgment is per-device. Token changes while logged out register on next signed-in foreground use; an offline former manager may retain a local alarm until the app refreshes. See native-notifications.md for details.

Required database migrations: partner_atomic_changes, managed_opening_workflow, native_opening_completion. Deploy matching server/client with the Firebase production credential. Existing 1.3.0 download remains available; latest.json and install.html point to 1.4.0.

Released 15 October 2026: all three migrations applied to production; Vercel deployment dpl_DSmh7RkBd8SnrUjE4pjnb1rgahzP promoted. Public latest.json reports version code 6; downloaded APK matches SHA-256 ba57344b2685094e74b451ab31b75ded9bc1cecd518e79edd3df0b84f14dd4e7. Authenticated pending-alerts worker returned HTTP 200 with opening sent=0, failed=0. No registered real-device delivery was asserted by this smoke test.
