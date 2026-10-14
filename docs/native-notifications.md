# Native partner notifications — staged, cloud connection blocked

## Implemented

Android Firebase Messaging receiver (pinned SDK 26.0.0), server Firebase Admin sender, and authenticated device registration share the existing notification delivery pipeline. FCM uses high-priority data messages so the app owns notification rendering in foreground/background. Public Android Firebase values are generated from `android/app/google-services.json` when present; internal debug builds remain possible without a provisioned Firebase project.

An account/cart binding is attached to each message and checked on-device. Switching identities clears prior partner notifications and rejects messages carrying the former binding. Registration derives cart/role/staff ID from the authenticated server identity. Tokens and private service-account credentials are not printed. Server credentials use `FIREBASE_SERVICE_ACCOUNT_JSON`; never bundle this variable or a private key into Android/web assets.

Partner alerts use a high-importance channel, alarm sound, vibration and Android's insistent notification flag. An explicit **Acknowledge** action cancels the notification and persists its event ID; retries of an acknowledged event remain silent. Acknowledgment is local to the phone, not an order acceptance or inventory completion. Owner “Mark read” also acknowledges the corresponding local opening notification. Android channel settings, permission, volume, Do Not Disturb, force-stop and delivery restrictions take precedence; uninterrupted ringing cannot override OS/user controls.

Local opening reminders also have **Acknowledge**. This silences the current business day's reminder and schedules the next day; it never creates an opening stock record. Saving stock still stops the reminder automatically. Alarms and registered push remain assigned after logout as requested.

## Verified

- 33 Node unit/API tests plus 25 isolated database tests, including server-authoritative native device registration and malformed token rejection.
- Android debug/test build and lint passed with the Firebase dependency.
- Android 7 emulator instrumentation: real scheduled notification; acknowledge action cancels partner notification; persistent acknowledgment suppresses redelivery; wrong account binding is ignored; simulated cross-phone completion stops the local inventory reminder and suppresses delayed reminders; local reminder acknowledgment does not complete inventory and does not re-ring that day. Existing print/update/security checks also passed.
- No real FCM message, live service-account send, newer Android notification channel behavior, or physical audible/haptic delivery was verified.

## External blocker (2026-10-14)

Authenticated Firebase account: aaddyyss90@gmail.com. The connector lists zero projects. Adding Firebase to the already-requested `cartlyft-momowala` Google Cloud project returns HTTP 403. Retried after the user said account setup was ready; result unchanged. The Firebase console itself displays “An error occurred when loading the terms of service acceptance status,” including at the official `?forceCheckTos=true` workflow. User has been asked to resolve that account setup in their regular browser or supply an accessible project ID. Do not create duplicate projects to evade this.

## Remaining work before release

1. Resolve Firebase account/project access, register `com.cartlyft.momowala`, retrieve its Android config, and provision a server sender identity with only required FCM permissions. Store its credentials through deployment secret management.
2. Test actual background/locked-screen delivery on Android 7 and a current Android phone, including denied notification permission, muted channel, duplicate push, logout, token refresh and account switch.
3. Apply `20261014141156_native_opening_completion.sql` after the managed-opening migration. Completion control messages now target the submitting manager’s registered native phones, update local completion and suppress delayed reminders; this path passed simulated device and database checks but still needs real FCM delivery validation. Manager reassignment while an old phone is offline remains a gap. Token changes while logged out are stored locally but registration refresh currently waits for next signed-in foreground use.
4. Acknowledge is per-device; it does not silence another phone's alert. An explicit server device-unassignment control is still required for a complete device-management experience.
5. Deploy required database migrations and matching server/client together only in a coordinated rollout. APK version/downloads remain unchanged. Explicit APK release approval is still required.
