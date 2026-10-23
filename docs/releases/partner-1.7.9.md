# Partner 1.7.9 (code 21)

User explicitly requested push and publication. Owner and ordinary order notifications use a separate silent channel without native playback, vibration or insistent flags. Only staff-bound manager closing alerts ring; opening reminders remain assigned-manager configuration, 30 minutes before opening. Owner binding clears legacy opening alarms. Playback startup removes obsolete owner/order ringing entries.

Notification intents carry an allowlisted target and cart context, retained until the matching logged-in partner screen consumes it. Closing routes to owner Reconcile or staff closing card, orders to owner Orders/staff Pending, opening updates to Stock. Tapping an informational notification dismisses it locally without acknowledging its server report. Native notifications use the Cartlyft monochrome cart icon.

Release APK bundles isolated partner web source (customer work excluded). Signed APK/version metadata verification and release lint passed. Focused Android 7 instrumentation passed for silent owner reports, silent orders, owner rejection of manager ringing, brand icon, closing silence/redelivery and lock-screen copy. Device-specific routing/lock-screen presentation still requires physical-phone confirmation. Existing minimum-version policy unchanged. No database changes in this release.
