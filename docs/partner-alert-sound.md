# Cartlyft alert sound (unreleased)

The user confirmed that **Accept or Acknowledge** stops an order alert. Opening
Cartlyft or the notification tray does not acknowledge it. Opening inventory
continues to stop on explicit acknowledgment or saved stock completion.

## Implementation
- Original five-note Cartlyft musical cue, 2.5-second loop, generated without
  external recordings by `scripts/generate-alert-tone.py`. WAV is bundled in
  `res/raw/cartlyft_attention.wav`, so playback needs no download.
- One media-playback foreground service owns the looping sound and vibration
  for all pending alerts. This replaces reliance on `FLAG_INSISTENT`, which
  Android may silence when the tray opens. Android's alarm volume/audio focus
  and channel settings remain authoritative. No forced volume or DND bypass.
- Strong repeating vibration requests amplitude 255 on Android 8+, subject to
  vibrator hardware support; Android 7 uses the device's default strength.
- Individual acknowledgments remove only that event. The ongoing summary also
  provides an explicit Acknowledge alerts action. Final acknowledgment stops
  and releases playback, vibration and the foreground service. Replayed events
  already acknowledged stay silent. Account reassignment clears old alerts;
  logout retains assignment as previously requested.
- Versioned alert channels provide the new default tone on existing installs,
  retaining old importance/mute/vibration preferences. New channel user settings
  are controlled by Android. Older channels are retained for upgrade continuity.
- In-app acceptance/payment and synchronized order state stop the corresponding
  native alert. Native notification acknowledgment is device-local; it does not
  mark a database order paid or silently accept orders on another phone.
- APK foreground order detection uses the same native playback path. Browser
  audio remains for browser users. APK Alert settings opens Android settings.

## Platform boundaries
A high-priority FCM message or eligible local alarm may start the service in the
background. If Android rejects that start, the custom-tone insistent notification
is the fallback; Android then controls repeat duration. Force-stop, disabled
notifications, phone volume, audio interruptions and manufacturer power policies
can prevent or interrupt alerts. Physical phone sound/vibration review remains
necessary; emulator playback does not measure speaker loudness or vibration.

No Android version bump, release APK generation, public download replacement or
production deployment is included. This accumulates with the pending sync/update
fixes for a separately approved release.

## Verified
Debug APK/instrumentation builds and Android lint pass. All 36 app tests pass.
Android 7 and Android 15 emulator instrumentation verifies that the bundled WAV
is decodable, the MediaPlayer is actually playing and looping after tray
expansion, acknowledgment removes only the chosen event, the last acknowledgment
stops the service, duplicate delivery stays quiet, and opening completion still
cancels the reminder. Existing update-gate, print-routing and reminder tests pass.
