# Cartlyft Partner 1.7.0 — 19 October 2026

User explicitly approved building and publishing this release. Android version code 12; package/signing identity unchanged. Published directly as an APK, not to Google Play.

- Server-verified startup and business state; no cached/demo fallback. Pending commands and legacy recovery copies remain preserved.
- Shared Supabase daily packing progress, safe legacy import and rejected-edit merge protection.
- Owner-configured manager closing time, cash/stock handover reports and persistent native alerts. Current manager permissions, submissions and owner acknowledgments are database-owned.

Public installation: https://momowala-os.vercel.app/install.html
APK: https://momowala-os.vercel.app/downloads/cartlyft-1.7.0.apk
SHA-256: `183c6a798b6a93f5f8b3376b294dd1c988f64eca92255fbdc8e257cb30066b89`
Size: 3,974,463 bytes.
Deployment: `dpl_CiBDgi71bP8tdhbpyNEF3SUyvoHR`.

The closing schema was applied additively; existing reports/orders were not rewritten. RLS and direct-write denial verified. The authenticated deployed closing dispatcher returned HTTP 200 with zero sends while all cart schedules remained disabled. Public update metadata, install-page link and downloaded APK checksum verified. Minimum supported version is now 12, enabled only after the new download was verified; supported older builds show their native pre-login required-upgrade flow.

Validation: 37 application tests and 31 isolated database tests passed in this release run; signed APK/AAB and release lint passed. Earlier Android 7/15 runs passed 31 UI checks and native closing alert/stop regressions. Matching release certificate verified; emulator in-place 1.6.1 → 1.6.3 → 1.7.0 upgrade preserved the original install timestamp and launched the login screen. An emulator System UI boot ANR cleared after waiting; it was not a Cartlyft application crash.

Security advisor output reflects the existing custom-session RPC design: anonymous direct report writes are denied, RPC bodies validate session/cart/manager or backend secret, and tables accessible only through RPCs intentionally have no direct RLS policies. Existing `pg_net` public-extension warning remains. References: [RPC advisor](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [extension advisor](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).

Closing schedules are not automatically enabled. Update both phones, then use Owner → Reconcile → Daily closing → Configure closing (22:00 IST for the requested Momo Wala example). A real two-phone FCM closing delivery test remains before live activation; emulator message-handler tests do not prove end-to-end provider delivery. Physical OEM sound/vibration and printer behavior retain their device-testing limitations. Genuine conflicting business edits still require review; this release does not silently replay them over server records.
