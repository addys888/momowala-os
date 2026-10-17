# Cartlyft Partner 1.6.0

Approved for public release on 17 October 2026. Android code 8, Android 7+.

- Checks update policy in native onCreate before loading login; required updates
  block access, optional updates offer download. Android approves installation.
- Small startup/sign-in spinners replace the Getting ready card.
- Order recovery preserves original operation IDs; removes set-aside shortcut.
  Live missing split column repair already applied without removing records.
- Original bundled Cartlyft ringtone and persistent vibration service, stopped
  by acknowledgment/completion. Android volume, focus and power policy apply.
- Loads screens on demand, avoids duplicate startup polling, bounds API requests.

Validation: 36 app tests, 27 local database tests, signed APK/AAB and release lint.
Android 7 and 15 emulator notification/playback regressions passed; pre-login
ordering verified on Android 7. Physical device loudness and background delivery
remain device-dependent. No real customer orders were submitted for testing.

APK: 3,968,795 bytes.
SHA-256: 4e7a3c0a090d48c800b982148b509f69ccd1013a841bbf600be9445dffe8b9ca
Signer SHA-256: 01ee54ee8ea8979355c96595b33a8d2f7e6d2134f4d36b1916237833e65e9b36

Production adds a read-only public android_update_policy table and /api/app-update.
The minimum version is raised to 8 only after the matching public APK is verified.
Older APKs cannot acquire the new startup gate until upgraded once. Use their
App settings → Check for updates or the public install page. Install over the
existing app; do not uninstall or clear storage with pending orders.
