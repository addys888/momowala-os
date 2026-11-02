# Manager alert acknowledgment — Partner 1.8.4

Notification taps now silence manager closing playback before navigating. Opening-stock notifications similarly acknowledge the local reminder before opening Stock. The playback summary opens the currently ringing task and silences active playback. Its acknowledge action stops all currently active sounds/vibration.

A native in-app dialog surfaces active alerts while the activity is foregrounded, with Start task and Acknowledge actions. Notification actions and privacy-safe lock-screen copies remain available outside the app; Android lock-screen visibility settings still apply. This change does not request unrestricted background full-screen activity launches.

Closing acknowledgment pauses reminders on that phone for ten minutes, including newly arriving reminder-slot keys, without submitting a report. Opening acknowledgment silences today's opening reminder without marking inventory loaded. Server-confirmed submission still stops the corresponding task; owners remain informational/silent.

The bundled original double-beep WAV is five seconds long, with two softly enveloped 660 Hz tones and a quiet interval. Vibration is two short pulses. New notification channel versions apply the new sound on upgrade while preserving disabled/muted channel settings. Existing pending playback uses the new sound too.

Validation: 44 existing tests and web production build passed. Debug Android build/lint and instrumentation test compilation checked; no connected phone/emulator, so instrumentation execution, lock-screen/OEM behavior and physical audio volume remain unverified. Release 1.8.4 rebuilds the isolated partner web bundle, including the report/loading buttons, and packages it with the native changes.
