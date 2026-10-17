# Partner app dry run — 17 October 2026

Status: fixes included in the user-approved 1.6.1 release (Android code 9). The dry run used isolated data; no production business records were changed. See release-1.6.1.md for release validation.

## Method and safety

The instrumentation runner loads the real React owner/staff components in Android WebView. It uses a separate `https://qa.cartlyft.invalid` storage origin, an isolated in-memory business fixture, simulated opening-status/notification responses, and a denied-by-default network interceptor. Test assets belong only to the instrumentation APK; the blank host Activity exists only in debug builds.

UI save tests verify local screen behavior and state transitions. They do **not** claim live cross-phone backend delivery. The separate local PostgreSQL suite verifies actual SQL authorization, atomic stock/payment mutations, retries, reconciliation, staff HR, opening loads, notification jobs and update-policy permissions. Existing application tests cover the durable outbox, recovery and order merging.

## Issues fixed

| Priority | Area | Finding | Fix / verification |
|---|---|---|---|
| High | Staff New Order | Two clicks before the next React render could submit the same basket twice. The in-flight ref was already reset synchronously. | Remember the successfully submitted basket; reject its reuse. Simulator asserts exactly one appended order and one five-piece deduction. Failed saves remain retryable. |
| Medium | Owner Orders | Returning through the normal Orders tab after opening an overdue order retained the old date. | Clear the deep-link date on normal navigation; today's dashboard shortcut explicitly selects today. Reproduced before the fix and regression-tested. |
| Medium | Pending payment | A rejected local split-payment save closed the dialog and discarded the entered cash/UPI amounts. | Return the save result and close only after success, for both pending-order settlement and new split orders. Simulator injects failure and verifies amounts remain. |
| Medium | Stock | Plate/glass handover and stock-type editors could close despite failed local persistence. Stock-mode changes could continue into the flush step after failure. | Respect the persistence result and retain editor values. Handover retry and stock-type failure tested. |
| Medium | Reports / Wastage | Fractional expense/piece inputs were silently truncated with `parseInt`. | Require positive safe whole numbers, matching integer storage; show validation instead of changing the user's value silently. Simulator covers invalid and valid input. |
| Medium | Reports / Home | Expense-delete confirmation closed, and the cart toggle continued its flush path, even if local persistence failed. | Stop those follow-up actions on failure. Reviewed alongside the other save-result guards. |
| Medium | Android 7 layout | Original WebView does not support CSS Grid, stacking revenue and operational summaries. | Scoped Flexbox fallback for summary grids and loading indicators; simulator asserts side-by-side revenue columns and captures screenshots. |
| Low | Order confirmation | The placeholder `#Waiting to sync` rendered as a giant order number. | Compact pending-sync message; large token shown only after server confirmation. Screenshot regression evidence retained. |
| Medium | Android lifecycle (existing unreleased work) | Resume after login could repeat the automatic update check. | Automatic check remains at native startup before login; foreground resume only resets the download-ready prompt state. Native instrumentation covers startup and foreground behavior. |

## Tab coverage

| Role / tab | Exercise |
|---|---|
| Owner Home | Render, horizontal layout, opening-status flag, unpaid-order shortcut |
| Owner Orders | Today/overdue navigation and date reset |
| Owner Stock | Opening readiness, freezer-to-cart transfer and movement log, handover failure/retry, failed stock-type save |
| Owner Menu | Edit a real menu row, leave tab, return and verify value |
| Owner Reconcile | Enter counts, save a day-close record, leave/return and find saved report |
| Owner Staff | Registry render, manager fixture, leave/holiday form read; real HR authorization/conflicts covered by local SQL tests |
| Owner Reports | Overview/chart render, fractional-amount rejection, expense save and retention across tabs |
| Staff New Order | Menu selection, rapid duplicate taps, stock deduction, pending-sync confirmation |
| Staff Pending | Previous-day unpaid order remains accessible; failed split keeps input; cash collection does not deduct counter stock twice |
| Staff My Orders | Render populated staff history |
| Staff Wastage | Reject fractional pieces, save whole pieces, verify stock and log |
| Staff Shift | Render shift summary |

## Final verification

- Android 15 emulator: **26/26 UI flow checks passed**.
- Android 7 emulator with original WebView: **26/26 UI flow checks passed**; older CSS layout fallback visually inspected.
- Application regression suite: **36/36 passed**.
- Isolated local PostgreSQL suite: **27/27 passed**.
- Final Android debug build, Android lint and opening-schedule clock tests: **passed**.
- Android 7 native instrumentation: **passed**, including persistent playback state, acknowledgment, separate outstanding alerts, reminder completion, printing intent/byte preservation, unsafe-link blocking, startup-before-login, no foreground update request, update policy and tampered-APK rejection.
- The native acknowledgment test had a race: it observed the acknowledgment preference before the receiver removed the pending playback entry. The assertion now waits (up to the same three-second deadline) for both effects and still verifies other alerts remain active. No notification behavior was weakened to make it pass.
- Screenshots and machine-readable results: `.local-simulator/flows-android15/`, `.local-simulator/flows-android7/`; native output: `.local-simulator/native-android7-results.txt`.

## Reproduce

Start the desired emulator using `npm run simulator` or `npm run simulator:android7`. Those ordinary launchers use the configured real backend after login; do not enter test orders there.

Run isolated UI tests with `npm run test:ui:android` (Android 15) or `npm run test:ui:android -- --android7` (Android 7). The script checks the emulator identity before installing. Results and screenshots are written under `.local-simulator/flows-android15/` or `.local-simulator/flows-android7/`. Use `--no-build` only when the instrumentation APK was most recently built with `-PflowTests`.

Other checks: `npm test`, `TEST_PG_PORT=55443 npm run test:db` against the isolated local cluster, `npm run check:android`, and the `PrintRoutingTest` device instrumentation suite.

## Limits

- This is a high-level regression audit, not exhaustive coverage of every field, account lifecycle or error combination.
- No live credentials or production test orders were used. Live login, two real phones, FCM delivery, physical printing and audible/vibration behavior on manufacturer-specific phones still need a controlled real-device acceptance run.
- The Android 7 launcher disables host audio because the local emulator deadlocked in CoreAudio microphone initialization. It also cold-boots with software graphics and disables blocking crash-report prompts. This does not change the shipped Android app.
- The emulator checks cannot establish production startup/network latency or validate every Android battery restriction.
- No existing report or order data was deleted, reset or migrated by this review.
