# Cartlyft Android application

Signed, universal APK for Android 7.0 (API 24) and newer. Package: `com.cartlyft.momowala`. Version 1.2.0 / code 4. The application uses the existing Supabase database and Vercel APIs. It bundles the React screens with compatibility bundles for Chrome/WebView 51 and newer, so installation does not depend on PWA shortcut support.

## Install

Open https://momowala-os.vercel.app/install.html on the phone, download the APK, permit installation from that source, then install. Android 7 uses Settings → Security → Unknown sources. Sign in online with the existing account. An APK update should be installed over the previous version; do not uninstall or clear app storage with pending writes.

The APK contains public API configuration only. Server keys and release signing material are excluded. Web content is served from packaged assets under the existing HTTPS origin, following the same-origin local-content approach documented by Android: https://developer.android.com/develop/ui/views/layout/webapps/load-local-content . API requests continue to the real server. Other sites, phone/UPI/WhatsApp links, open externally. App updates download through Android DownloadManager and open Android’s installer after verification. Mixed content and file access are disabled; TLS errors are never bypassed. Android backup is disabled to avoid copying session tokens to cloud backups.

## Features and limits

- Dedicated launcher icon; Android back navigation; native file picker; print / save as PDF; app menu with reload, website, updates and help.
- Offline staff queue remains the same durable, idempotent queue as the website. Initial sign-in and customer-order confirmation require internet.
- The app keeps its screen awake while foregrounded for cart operation. Keep it open for in-app order alerts.
- **Background push is not implemented in this APK.** Browser Web Push does not run in Android WebView. A future native push integration requires a Firebase project, app registration, and server credentials. The website keeps its existing browser push support.
- Bundled screens update by installing a newer signed APK, not by the website's auto-refresh. Server data and menus update normally.
- APK testing does not replace a smoke check on the user's physical Android 7 phone, particularly file picking, OEM WebView and any attached printer.

## Build

Install JDK 17, Android SDK platform 35, build-tools 35.0.0 and platform-tools. Set `JAVA_HOME` and `ANDROID_HOME`, or create ignored `android/local.properties` with `sdk.dir=/path/to/sdk`. Gradle 8.11.1 is pinned, including its distribution SHA-256 checksum.

```sh
npm ci
# .env.local contains the existing public VITE_ configuration.
npm test
npm run build:android
```

Outputs:

- `public/downloads/cartlyft-1.2.0.apk` and `.apk.sha256`
- `android/app/build/outputs/bundle/release/app-release.aab` (for future Play Console work)
- `android/app/build/reports/lint-results-release.html`

The AAB is not a Play Store publication. This release is distributed directly as an APK.

## Signing and updates

Signing files on the build computer are in `/Users/adarsh/.config/momowala-android/`, outside the repository, with private filesystem permissions. **Back up this directory securely.** Losing the release key prevents in-place updates for existing installations. Never publish the directory or put it in Git.

Gradle reads `MOMOWALA_SIGNING_PROPERTIES`, or defaults to `~/.config/momowala-android/signing.properties`. Its fields are `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. A release build fails when signing configuration is missing. Other build machines should use a private copy of the same release key.

For the next release, increase `versionCode` and `versionName` in `android/app/build.gradle`, update `public/install.html` (the build script derives artifact and manifest versions from Gradle), build, verify `apksigner verify`, and deploy the website containing the new APK. Retain previous APKs for traceability. Never ship a debug APK as an update.

## Release verification

Version 1.0.0 was installed and launched on an Android 7.0/API 24 ARM64 emulator using its stock Google WebView 53.0.2785.124. Checked login-screen rendering, live marketplace/menu reads, Android back navigation, and cold startup with mobile data/Wi-Fi disabled. No real customer orders were created. An old-WebView `Intl.formatToParts` failure discovered during this test was removed from business-time calculations and covered with a midnight/year-boundary regression test.

All 13 API/outbox/compatibility tests passed. APK/AAB release builds passed; Android lint reported zero errors and three warnings (JavaScript enablement required by the bundled React app, icon silhouette, and untranslated native strings). Signature verification passed using Android 7's v2 signature scheme. The published APK checksum matches the signed local artifact. Full npm audit reports zero vulnerabilities. Newer Android OS versions and a physical cart phone were not device-tested in this run; file chooser and printer hardware still need a device check.

## Version 1.1.0

Adds Owner → Staff → Attendance & leave: onboarding date, optional monthly off allowance, employment notes, and full/half-day weekly offs, holidays, personal leave, sick leave and absences. Monthly totals distinguish recorded days through today from future planned days. Requires internet to save. Records are restricted to the cart owner and platform admin, with conflict detection for concurrent edits. No payroll deduction or inferred attendance. Install this update over version 1.0.0 to receive the new bundled screens.

Validation: 15 unit/API/compatibility tests and 13 isolated PostgreSQL tests, including attendance privacy, validation, concurrent edits and retry safety. The browser flow was checked against the isolated database; production staff records were not modified for testing.

## Version 1.1.1 — receipt printing fix

The native external-link allowlist previously omitted the `rawbt:` scheme used by both customer bills and kitchen tickets. The WebView consumed these links without opening RawBT, while Chrome opened the printer app correctly. The APK now dispatches them using ACTION_VIEW with the exact original payload. If no handler is available, a message asks the user to install/enable RawBT and select a printer. No Bluetooth permission is needed in Cartlyft; RawBT owns the printer connection.

Android 7/API 24 instrumentation dry run passed: outgoing RawBT intent, unchanged receipt bytes, subframe suppression, unsafe-scheme blocking, and existing HTTPS routing. The test intercepts the handoff without actually printing. Receipt and kitchen-ticket JavaScript payload checks and all 15 existing unit tests passed. Signed release APK/AAB and lint builds passed. Physical printer output still requires a test on the user's phone.

Run the native regression test on an isolated Android emulator with the debug APK and Android test APK installed:

```sh
cd android
./gradlew assembleDebug assembleDebugAndroidTest
adb shell am instrument -w com.cartlyft.momowala.test/com.cartlyft.momowala.PrintRoutingTest
```

The expected instrumentation output starts with PASS. Use an isolated emulator: debug signing differs from the distributed release. Users must install the signed 1.1.1 APK over their existing release, keeping app data.


## Version 1.2.0 — opening stock and easier updates

Explicit release approved on 13 October 2026. Includes the startup/header improvements, atomic opening inventory transfer, local alarms 30 minutes before opening, user-approved persistence after logout and explicit device unassignment. The opening inventory migration is deployed. Firebase background cross-phone completion/schedule updates remain unavailable; another phone’s changes are observed when this app refreshes online. Native closing alarms and a complete closing-count workflow remain future work.

From this version, use **App settings → Check for updates → Download update**. Android DownloadManager handles background transfer and retry across app closure. Return to the app to install; active downloads are retained by ID, and completed files are checked for exact byte size, SHA-256, package identity, a higher version and the installed signing certificate. A narrow, non-exported FileProvider shares only the update directory. Android 8+ may ask to allow Cartlyft as an installation source; Android 7 uses its global Unknown sources control. The system installation confirmation is mandatory. Cancelling leaves the existing app usable. There is no silent installation, arbitrary APK URL input, or web-controlled update command.

Existing versions need one download from the install page to gain the native updater. Future releases still require explicit owner approval before publication. The updater only downloads when requested by the user; it does not install unpublished work.

Validation: 16 unit/API tests, 15 isolated database tests, Android debug/release lint/builds, Android 7 instrumentation covering notification scheduling/cancellation, logout persistence, cart assignment isolation, print routing, invalid update metadata, tampered APK rejection and narrow provider paths. Signed 1.1.1 → 1.2.0 in-place installation succeeded on the Android 7 emulator. Both releases use the same signing certificate. Physical-phone/OEM installation prompts, ringing/vibration and printer output still need on-device checks.


## Post-1.2.0 sync hotfix (13 October 2026)

The live database lacked `day_close_logs.unrecorded`, although the bundled day-close serializer always includes it (including null for ordinary days). The row RPC therefore rejected reconciliation writes with `Column not allowed: unrecorded`. The compatibility migration adds the nullable boolean without changing historical reports or access checks. Applied and verified on the existing production project; no APK release or version bump.

Already rejected operations remain paused in 1.2.0 local storage; a normal refresh does not retry them. Its existing “Reload saved data” action archives rejected operations locally and removes them from the active queue, so users must note and re-enter any unsynced reconciliation figures. Do not clear app storage or uninstall. A new explicit “Retry sync” button is staged in source for the next approved app release; it preserves IDs/payloads and only retries the current actor’s queue. It is not present in the published 1.2.0 APK.

Regression checks: 18 unit/API tests, 16 isolated PostgreSQL tests, including nullable/manual day-close flags, duplicate prevention and owner/cart authorization.
