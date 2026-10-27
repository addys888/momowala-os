# Owner opening and closing notifications

Production evidence checked at 23:56 IST on 26 October:
- Momo Wala opening load by Sumit saved at 15:03:59 IST. The corresponding owner inbox entry exists and is unread.
- Opening delivery records show successful handoff to two Android owner subscriptions and one browser subscription at 15:04 IST. Provider acceptance does not prove display on the handset.
- The 26 October closing report has no submitted_at value, so no submission notification should be generated yet.

Found and fixed: opening, closing and generic inbox delivery helpers attempted to parse successful HTTP 204 acknowledgements as JSON. This caused erroneous job failures after database acknowledgement. All three helpers now accept empty successful responses. The server-only patch preserves v1.8.0 and its APK download.

Queued for the next APK: refresh bell on visibility/reconnection, restrict completed-opening suppression to staff opening reminders, and check the informational notification channel when reporting owner notification permission. Instrumentation regression added for inbox delivery after opening completion.

Validation: seven partner database tests and three delivery-handler tests passed. Android source and instrumentation compile passed. Native instrumentation was not executed because no device/emulator was connected. Physical owner notification display still needs verification on the user's phone; no guarantee is made when Android notification permission/channel is disabled.
