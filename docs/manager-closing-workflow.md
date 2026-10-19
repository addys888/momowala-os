# Manager closing workflow

Published in 1.7.0 on 19 October 2026 with the user’s explicit release approval. The schema and dispatcher are deployed. Cart schedules remain disabled until explicitly configured; no live reports were fabricated.

## Owner and manager journey

- Owner: Reconcile → Daily closing → Configure closing. Enable the workflow and choose an IST time; the default offered is 22:00. Each cart has independent database settings. Assign the active cart manager under Staff first.
- At the configured time a server task snapshots the cart's stock-item definitions. Only the current assigned active manager can submit physical cash, every stock-item count (including zero), and optional handover notes.
- The manager's Android alert uses the bundled Cartlyft tone and vibration loop. Generic notification acknowledgment does not stop closing alerts. A successful database submission stops the submitting phone immediately; a durable stop message and server polling stop other registered phones.
- Owner: a persistent ringing report alert opens the app; the home-screen flag leads to Reconcile, where the manager's saved counts can be reviewed and acknowledged. Owner acknowledgment is stored in the database and propagated to other phones.
- Manager reports are immutable handover evidence, separate from final owner reconciliation. They do not mutate stock balances or inflate revenue. Existing reports are preserved. Display includes all outstanding/unread reports plus the previous 60 days of acknowledged history.

## Data, scheduling, and delivery

`cart_closing_settings` stores configuration and a compare-and-swap revision. `closing_reports` stores due times, item definitions, physical counts, manager identity and acknowledgments. Direct client report-table access is denied; session-checked RPCs enforce cart isolation and the current manager assignment. The existing opening-manager assignment is reused.

The authenticated minute scheduler (`pending-alerts`) also runs the closing dispatcher. Collection catches the previous date around midnight and deduplicates each cart/date. Closing dates use the IST calendar date on which the configured closing time occurs. Enabling/changing a schedule applies to future scheduled tasks; existing tasks/reports are retained. Disabling cancels manager reminders without deleting reports.

Delivery leases protect concurrent dispatcher runs. Failed deliveries retry, and unresolved active alerts are redelivered every five minutes even after provider acceptance. Completion, reassignment, disablement and owner acknowledgment generate durable cancellation messages. Assignment/settings revisions make a new alert identity when responsibility changes. Native completion tombstones suppress delayed, out-of-order reminders. Opening-completion state cannot suppress closing messages.

Business rules and saved reports do not depend on localStorage. Unsubmitted fields live only in the current form; network failures preserve them while it remains open. Native preferences retain device binding/playback and cancellation identifiers, not cash/stock authority. Internet and enabled Android notification/sound permissions are required; Android force-stop/DND/battery restrictions can delay or suppress delivery.

## Validation

- Application regression tests: 37 passed.
- Local PostgreSQL tests: 31 passed, including tenant and role denial, inactive/reassigned manager rejection, cash/stock validation, duplicate submission, midnight deduplication, endpoint leases, owner acknowledgment and cancellation.
- All 31 isolated UI checks passed on Android 7 and 15 and cover owner configuration, manager failed-save preservation and submission, owner report review, and ordinary-staff denial alongside existing partner flows.
- Native instrumentation passed on Android 7 and 15 and covers closing independent of opening completion, refusal of generic acknowledgment, cross-phone stop payloads, delayed-message suppression, and owner report cancellation.

Internal Android build, lint and alarm scheduling checks passed. Artifact: `.local-simulator/cartlyft-closing-workflow-internal.apk` (debug signing; not an upgrade for public installs).

## Release integration

Migration `20261018181353_managed_closing_workflow.sql`, dispatcher/UI/service worker and compatible APK are deployed. Update both owner and manager phones before enabling the desired cart settings. Do not enable the new workflow with old native builds: old clients do not understand the closing-specific stop messages. For Momo Wala, select 22:00 and the assigned manager after that coordinated rollout.

A real two-phone production FCM closing test remains required before enabling live cart schedules. Emulator delivery tests invoke the native message handler; they do not prove provider/network delivery. No real cash/stock reports or customer orders were created by these tests.
