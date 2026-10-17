# Cartlyft Partner 1.6.1

User-approved public release, 17 October 2026. Android code 9; Android 7+.

- Avoid repeated automatic update checks when resuming after login. Startup checks before login and explicit menu checks remain.
- Prevent rapid duplicate submissions of the same order basket.
- Preserve payment and stock editor inputs when a local save fails.
- Reset owner order dates on normal tab navigation.
- Validate whole-piece wastage and whole-rupee expenses without silent truncation.
- Improve Android 7 summary layouts and pending-sync order confirmation.

Validation: 26 isolated UI checks each on Android 7 and Android 15, 36 application tests, 27 isolated database tests, Android 7 native instrumentation, signed APK/AAB and release lint passed. Release manifest has no debug test Activity; instrumentation fixtures are excluded. Full scope and real-device testing limits are in partner-flow-review-2026-10-17.md.

APK: 3,969,663 bytes.
SHA-256: 13a0b9898b0268e0e768c90a5136b5b2becfe6c93701359c28464bdd43689d97
Signer SHA-256: 01ee54ee8ea8979355c96595b33a8d2f7e6d2134f4d36b1916237833e65e9b36

Minimum supported update-policy version remains 8; this maintenance update is offered to 1.6.0 users. The signed APK uses the existing application ID and signing key for installation over the current app. Do not uninstall or clear storage with pending changes. Android requires installation confirmation.
