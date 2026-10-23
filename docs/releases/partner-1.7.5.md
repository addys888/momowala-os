# Partner 1.7.5 (code 17)

Publication explicitly approved by user. Adds closing-specific Silence ringtone notification action and in-app control. Silence is local to the phone and alert, does not submit or acknowledge a server closing report. Existing generic acknowledge behavior remains unchanged. Lock-screen public notification copy contains generic task text with Open closing/Silence ringtone, keeping report/customer details private. Notification settings opens Android app notification settings on Android 8+.

Validation: 37 app tests passed; web/native release build and APK signature verification passed; Android lint 0 errors, 15 warnings. Android 7 focused instrumentation passed for closing silence, redelivery suppression, public notification copy and actions. Broader audio playback instrumentation previously failed its looping-after-tray check; no claim of complete audio/OEM validation. Physical phone lock-screen rendering and settings still require confirmation.

Production web source staged from the 1.7.4 partner-only deployment, adding ClosingWorkflow.jsx and new download metadata. Customer work remains excluded. APK is the signed current partner build. Existing minimum-version policy unchanged. Same-day late enablement database fix was already deployed independently.
