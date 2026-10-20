# Unreleased: closing configuration, alert sound, release welcome

No Android version bump, signed public APK, production deployment, or live migration has been made for this work.

## Closing configuration
An absent cart_closing_settings row was converted to a JSON object with null fields. COALESCE did not provide defaults, and Configure closing called slice on a null time. The migration now explicitly checks cfg.cart_id. The UI also normalizes missing fields. Configuration saves retain the revision read when editing began, so background polling cannot silently allow a stale form to overwrite another owner's change. Schedule enablement remains an explicit owner action.

## Downloaded ringtone
Replaced the bundled raw/cartlyft_attention waveform with the user-supplied Downloads/zomato_dum_dum_fire.mp3 (16.56 seconds). The resource URI is unchanged, preserving existing Android notification-channel preferences. Foreground playback continues to loop and vibrate using the existing acknowledgment/submission rules. Phones with a user-selected custom or silent channel retain that Android preference. Device instrumentation verifies that the packaged audio decodes and has the expected duration; real speaker volume is not verified on a physical phone.

## What's new
Staff see a full-page welcome before staff screens mount, based on the installed native APK version. Acknowledgment is a per-staff, per-cart, per-device preference, not business data. It persists through ordinary logins and app restarts; clearing app data resets it. Unacknowledged news reappears. Another staff member gets their own acknowledgment. Older APKs are never told they have features from a newer version.

The release catalog currently covers codes 12–15; code 15 is reserved for these unreleased changes. Update the catalog alongside future release version codes. Native appInfo is a read-only bridge returning only package version information. Browsers and old APKs without that command do not display this native-update welcome.

## Release steps
Apply supabase/migrations/20261019180950_closing_settings_defaults.sql when publishing, then verify an unconfigured cart returns enabled=false, closing_time=22:00:00, revision=0 without enabling any live schedules. Build the approved new version and verify the download as usual. Do not regenerate the old WAV beside the MP3: Android raw resources cannot have duplicate basenames.

Validation completed: 36 isolated database tests, 37 unit tests, and 38 UI scenarios each on Android 7 and Android 15 passed. Both emulator instrumentation runs decoded the exact bundled MP3 successfully. Android debug build and lint passed. Visually reviewed the Android 7 release welcome. Public download files and Android version numbers remain unchanged.
