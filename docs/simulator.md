# Local Cartlyft simulator

Run from this repository:

- `npm run simulator` — open the Android 15 simulator, build and install the current debug app.
- `npm run simulator:android7` — the Android 7 compatibility device.
- `npm run simulator -- --no-build` — reopen the most recent debug build quickly.

A visible Android Emulator window opens on this Mac. Sign in normally to inspect
owner/staff screens. Use the emulator's mouse, keyboard, Back button, rotation
and network controls. Close its window when finished. Builds are internal only;
these commands never bump versions or change public APK downloads.

The simulator uses the configured live backend. Orders, inventory, staff and
report changes made after login are real. Use a dedicated test cart/account for
write testing. The launcher does not log in or create any business data.

SDK is resolved from ANDROID_HOME/ANDROID_SDK_ROOT or ~/Library/Android/sdk.
Configured AVDs: Cartlyft_Push_Test (API 35 Google APIs ARM64) on port 5556 and
Cartlyft_Android_7 (API 24 ARM64) on 5554. Both exist on this machine. On another
machine, create matching devices in Android Studio Device Manager first.

On this Mac you can also double-click `Open Cartlyft Simulator.command` in Finder.
The local updater now checks automatically only at startup, before login.
Returning from login/home/settings does not fetch the policy again; manually
choosing Check for updates remains available. Download/install continuation is
preserved. Verified with Android 15 instrumentation and Android debug lint.

## Isolated tab-flow regression tests

`npm run test:ui:android` exercises real partner screens using instrumentation-only fixtures with production networking blocked. Use `-- --android7` for the Android 7 emulator. Start the corresponding emulator first. Screenshots and JSON results are saved under `.local-simulator/flows-android15` or `.local-simulator/flows-android7`.

The normal simulator launcher uses the configured backend; only this dedicated test runner uses isolated business data. Android 7 starts with a cold boot, software graphics and host audio disabled to avoid this system’s snapshot and CoreAudio initialization failures. Audible alarm testing requires a real phone. The launcher also disables blocking emulator telemetry/crash-report prompts for that run.

See `docs/partner-flow-review-2026-10-17.md` for coverage and remaining real-device checks.
