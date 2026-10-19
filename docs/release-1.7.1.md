# Cartlyft Partner 1.7.1 — 19 October 2026

Explicit user approval to build and publish. Android version code 13; same package and release certificate as 1.7.0. Direct APK distribution, not Google Play.

- Native notification registration and token checks run without loading/status banners. Allowed phones show no persistent enabled-notification row; missing permission gets a compact, dismissible prompt that refreshes after returning from settings.
- Removed the permanent Android staff alert-settings pill. Notification settings remain in the app menu. Opening-reminder setup is collapsed while action is needed and absent when fully enabled.
- Assigned managers see a redesigned read-only Pack today card on their New Order/home screen. Progress comes from Supabase; no edit, checkbox, bulk-change or legacy-import controls are exposed. Manager visibility follows the server-verified assignment. Existing owner-only database writes remain enforced.

Validation: 37 application tests; 34 UI checks on Android 7 and Android 15, including silent pending/error registration, permission changes, manager read-only progress, and ordinary staff exclusion; Android debug build/lint/scheduling and signed release APK/AAB/lint passed. Release v2 signature verified. In-place signed 1.7.0 → 1.7.1 installation succeeded and preserved the emulator's original install timestamp.

APK: https://momowala-os.vercel.app/downloads/cartlyft-1.7.1.apk
Installation: https://momowala-os.vercel.app/install.html
Bytes: 3,974,127
SHA-256: `27970f53c1bf472252d0d9c9beb7c9955b8943a0c22853bb81729e8feb301ade`

No database migrations or settings changes. Required minimum remains code 12 (1.7.0); this is an optional UX update. No live reports/orders were created or changed during these checks. Existing real-device/FCM closing-delivery validation gap from 1.7.0 remains; this UI release does not claim to close it.

Published production deployment: `dpl_E1FZ56UQPB5VX2tJU6YUVKwmhFKG`. Verified the public installation page, latest manifest and update endpoint report 1.7.1/code 13 (minimum 12). Downloaded the public APK and verified its byte count and SHA-256 match the signed local artifact. The release emulator was no longer running after the interrupted session, so post-upgrade launch was not rechecked; the completed in-place installation and earlier Android 7/15 UI checks are the validation recorded above.
