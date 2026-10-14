# Native partner notifications — connected and staged

## Implemented

Android Firebase Messaging receiver (pinned SDK 26.0.0), server Firebase Admin sender, and authenticated device registration share the existing notification delivery pipeline. FCM uses high-priority data messages so the app owns notification rendering in foreground/background. Public Android Firebase values are generated from `android/app/google-services.json` when present; internal debug builds remain possible without a provisioned Firebase project.

An account/cart binding is attached to each message and checked on-device. Switching identities clears prior partner notifications and rejects messages carrying the former binding. Registration derives cart/role/staff ID from the authenticated server identity. Tokens and private service-account credentials are not printed. Server credentials use `FIREBASE_SERVICE_ACCOUNT_JSON`; never bundle this variable or a private key into Android/web assets.

Partner alerts use a high-importance channel, alarm sound, vibration and Android's insistent notification flag. An explicit **Acknowledge** action cancels the notification and persists its event ID; retries of an acknowledged event remain silent. Acknowledgment is local to the phone, not an order acceptance or inventory completion. Owner “Mark read” also acknowledges the corresponding local opening notification. Android channel settings, permission, volume, Do Not Disturb, force-stop and delivery restrictions take precedence; uninterrupted ringing cannot override OS/user controls.

Local opening reminders also have **Acknowledge**. This silences the current business day's reminder and schedules the next day; it never creates an opening stock record. Saving stock still stops the reminder automatically. Alarms and registered push remain assigned after logout as requested.

## Verified

- 33 Node unit/API tests plus 25 isolated database tests, including server-authoritative native device registration and malformed token rejection.
- Android debug/test build and lint passed with the Firebase dependency.
- Android 7 emulator instrumentation: real scheduled notification; acknowledge action cancels partner notification; persistent acknowledgment suppresses redelivery; wrong account binding is ignored; simulated cross-phone completion stops the local inventory reminder and suppresses delayed reminders; local reminder acknowledgment does not complete inventory and does not re-ring that day. Existing print/update/security checks also passed.
- Real FCM on Android 15: server accepted the message, native receiver posted it, and the notification action persisted acknowledgment. A separate send while the app had no running process started the app and posted an ongoing, insistent alert with one acknowledgment action on the high-importance channel.
- Android 7 local instrumentation passed, but live FCM did not arrive on its emulator (Google Play services 20.24.14 from 2020). The newer emulator passed the same send/receive path. Physical Android 7 delivery and actual speaker/vibration output still require a phone test.

## Firebase connection resolved (2026-10-14)

The prior Google account terms/permission failure is resolved. Firebase was successfully added to the existing `cartlyft-momowala` project (display name Cartlyft, project number 508871710803). Registered Android app: `1:508871710803:android:bb02fe4e4714115e820ea6`, package `com.cartlyft.momowala`. Public app configuration is in `android/app/google-services.json`.

Created `cartlyft-push-sender@cartlyft-momowala.iam.gserviceaccount.com` and the project custom role `cartlyftPushSender`, granting only `cloudmessaging.messages.create`. Its key is outside the repository at `~/.config/momowala-firebase/push-service-account.json` (mode 0600). It is also stored as a sensitive production environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` on the existing Vercel project. No production deployment was triggered. Initial send denial cleared after IAM propagation; subsequent real sends succeeded.

To reproduce the optional live receive test, run instrumentation with `-e liveFcm true -e waitFcm true`, wait for `FCM test device ready`, then send a test data payload to that emulator's token using binding `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` and tag `live-firebase-verification`. Never log the token or private key. The test reports `Live FCM received and acknowledged` only after the actual notification action succeeds.

## Remaining work before release

1. Firebase configuration and the production secret are ready. Deploy the staged server/client and database migrations together in the approved rollout; the currently released APK has no Firebase configuration.
2. Real background delivery and acknowledgment passed on an Android 15 emulator. Still test physical Android 7 and current phones, including locked screen, denied permission, muted channel, logout, token refresh and account switch.
3. Apply `20261014141156_native_opening_completion.sql` after the managed-opening migration. Completion control messages now target the submitting manager’s registered native phones, update local completion and suppress delayed reminders; this path passed simulated device and database checks but still needs real FCM delivery validation. Manager reassignment while an old phone is offline remains a gap. Token changes while logged out are stored locally but registration refresh currently waits for next signed-in foreground use.
4. Acknowledge is per-device; it does not silence another phone's alert. An explicit server device-unassignment control is still required for a complete device-management experience.
5. Deploy required database migrations and matching server/client together only in a coordinated rollout. APK version/downloads remain unchanged. Explicit APK release approval is still required.
