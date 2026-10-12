# Cartlyft Android application

Signed, universal APK for Android 7.0 (API 24) and newer. Package: `com.cartlyft.momowala`. Version 1.1.0 / code 2. The application uses the existing Supabase database and Vercel APIs. It bundles the React screens with compatibility bundles for Chrome/WebView 51 and newer, so installation does not depend on PWA shortcut support.

## Install

Open https://momowala-os.vercel.app/install.html on the phone, download the APK, permit installation from that source, then install. Android 7 uses Settings → Security → Unknown sources. Sign in online with the existing account. An APK update should be installed over the previous version; do not uninstall or clear app storage with pending writes.

The APK contains public API configuration only. Server keys and release signing material are excluded. Web content is served from packaged assets under the existing HTTPS origin, following the same-origin local-content approach documented by Android: https://developer.android.com/develop/ui/views/layout/webapps/load-local-content . API requests continue to the real server. Other sites, phone/UPI/WhatsApp links, and app updates open externally. Mixed content and file access are disabled; TLS errors are never bypassed. Android backup is disabled to avoid copying session tokens to cloud backups.

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

- `public/downloads/cartlyft-1.1.0.apk` and `.apk.sha256`
- `android/app/build/outputs/bundle/release/app-release.aab` (for future Play Console work)
- `android/app/build/reports/lint-results-release.html`

The AAB is not a Play Store publication. This release is distributed directly as an APK.

## Signing and updates

Signing files on the build computer are in `/Users/adarsh/.config/momowala-android/`, outside the repository, with private filesystem permissions. **Back up this directory securely.** Losing the release key prevents in-place updates for existing installations. Never publish the directory or put it in Git.

Gradle reads `MOMOWALA_SIGNING_PROPERTIES`, or defaults to `~/.config/momowala-android/signing.properties`. Its fields are `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. A release build fails when signing configuration is missing. Other build machines should use a private copy of the same release key.

For the next release, increase `versionCode` and `versionName` in `android/app/build.gradle`, update the versioned artifact path in `scripts/build-android.mjs` and `public/install.html`, build, verify `apksigner verify`, and deploy the website containing the new APK. Retain previous APKs for traceability. Never ship a debug APK as an update.

## Release verification

Version 1.0.0 was installed and launched on an Android 7.0/API 24 ARM64 emulator using its stock Google WebView 53.0.2785.124. Checked login-screen rendering, live marketplace/menu reads, Android back navigation, and cold startup with mobile data/Wi-Fi disabled. No real customer orders were created. An old-WebView `Intl.formatToParts` failure discovered during this test was removed from business-time calculations and covered with a midnight/year-boundary regression test.

All 13 API/outbox/compatibility tests passed. APK/AAB release builds passed; Android lint reported zero errors and three warnings (JavaScript enablement required by the bundled React app, icon silhouette, and untranslated native strings). Signature verification passed using Android 7's v2 signature scheme. The published APK checksum matches the signed local artifact. Full npm audit reports zero vulnerabilities. Newer Android OS versions and a physical cart phone were not device-tested in this run; file chooser and printer hardware still need a device check.

## Version 1.1.0

Adds Owner → Staff → Attendance & leave: onboarding date, optional monthly off allowance, employment notes, and full/half-day weekly offs, holidays, personal leave, sick leave and absences. Monthly totals distinguish recorded days through today from future planned days. Requires internet to save. Records are restricted to the cart owner and platform admin, with conflict detection for concurrent edits. No payroll deduction or inferred attendance. Install this update over version 1.0.0 to receive the new bundled screens.

Validation: 15 unit/API/compatibility tests and 13 isolated PostgreSQL tests, including attendance privacy, validation, concurrent edits and retry safety. The browser flow was checked against the isolated database; production staff records were not modified for testing.
