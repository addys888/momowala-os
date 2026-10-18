# Cartlyft Partner 1.6.3

User-approved release, 18 October 2026. Android code 11, Android 7+.

Login renders independently of business-data hydration. Public startup uses one catalogue request. Role screens preload alongside authenticated data; redundant fresh-login validation, immediate repeat order/stock loads and competing reconnect refreshes are removed. Saved sessions and periodic identity checks remain validated. Full report history is retained.

Validation: Android 7 and 15 startup tests (5 each), Android 15 partner flow checks (26), application tests (36), final debug build/lint/scheduling checks, signed release APK/AAB and release lint passed. Existing signing certificate preserved.

APK bytes: 3970107
SHA-256: f194b4ab034e87b0fa25284fc42103192836d942b98e03ad941324ec7b2c5c83

See startup-performance-2026-10-18.md for measured scope and limitations. The separate order-conflict retry issue is not fixed. Minimum version policy remains 8. Install over the current app without clearing storage.
