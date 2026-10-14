# Managed daily opening — unreleased

Owners assign one active staff member per cart under **Staff → Registry & activity → Cart manager**. Only that staff ID can submit the daily opening inventory. Owners can replace the manager; other staff and owners see readiness without a submit button. Later top-ups remain owner stock operations. Disabling or deleting the manager removes loading access; owner must assign a replacement.

The manager reviews quantities, then confirms an online freezer-to-cart transfer. Stock changes, stock audit, opening record and owner confirmation commit together. One load per cart/business date and a stable retry ID prevent duplicate transfers. Server authorization applies to old clients and direct RPC calls too. Assignment changes have an audit trail and revision checks against concurrent owner edits.

## Alert behavior

- Manager reminder starts 30 minutes before opening (IST). Native local ringing retains the existing stop-on-completion behavior and continues after logout.
- Owner completion confirmation is stored immediately in the same transaction, visible in **Home → Opening alerts**. Inbox polling is 20 seconds while mounted.
- Missing stock produces one owner alert at opening. The existing production `cartlyft-pending-alerts` cron runs every minute; the staged endpoint now invokes the opening worker too. Healthy scheduling means detection on the first run at/after opening, not an exact-second delivery promise.
- A late submission still produces a missed-opening record even if it commits between opening and the scheduler's next run. Completion and missed alerts are distinct history entries.
- Midnight openings use the next business date for the previous evening's reminder. Missing/invalid opening hours are excluded from scheduling; owners must configure valid hours.
- Browser pushes use durable per-device delivery rows, leases, bounded batches, retries and expired-subscription cleanup. Successful devices are not retried when another fails. A process crash after provider acceptance can cause redelivery; stable notification tags collapse replacements. Provider acceptance does not prove the person saw the notification.
- Reminder recipients are checked against the current active manager's stable staff ID. Owner alerts are scoped to that cart and cannot be read by staff or another cart owner. A read acknowledgment is shared by that cart's owner sessions.

## Verified locally

- 32 unit/API tests, including unauthorized scheduler calls, missing push configuration, delivery acknowledgment, partial failure and expired endpoints.
- 24 isolated PostgreSQL tests: assignment permissions, stale edits, unassignment, atomic and concurrent loads, insufficient stock rollback, owner-only inbox, read acknowledgment isolation, exact opening boundary, late completion, midnight reminder and concurrent delivery claims/retries.
- Browser: owner assignment removal/reassignment persisted; manager reviewed and submitted 100 Veg momo; stock became freezer 400/cart 100; owner received the manager-named confirmation.
- Browser testing also caught and fixed a missing `orderStockDeltas` import that crashed the staff order screen.
- Android internal debug build, lint and opening schedule checks pass. No release version bump or public APK generated.
- Focused lint passes on new components, OpeningInventory and notification handlers. Existing repository-wide lint debt remains.

## Integration gaps and release order

**Not deployed or pushed.** Apply the prior `20261013150132_partner_atomic_changes.sql` migration and then `20261014061030_managed_opening_workflow.sql` before deploying the matching client/server bundle. Coordinate manager assignment during rollout: the migration deliberately stops unassigned staff and owner accounts from submitting opening stock. No staff member is promoted automatically.

Native FCM background delivery is **not connected**. On 2026-10-14 the authenticated Firebase connector returned zero accessible Firebase projects. Earlier project provisioning was denied. An accessible Firebase project, Android app registration/configuration, native FCM token registration and server delivery path are still required. Owner inbox works while the app is open; the Android UI explicitly states this limitation. Browser Web Push exists but live provider delivery was not exercised in this isolated test.

Cross-phone completion or manager reassignment only cancels an existing native local alarm when that phone next reads opening status. An offline/logged-out old manager phone can continue its local reminder until unassigned or brought online in the app. This must be resolved/tested as part of native background messaging before claiming complete background behavior.

Production scheduler existence was checked read-only. After an approved rollout, confirm its endpoint invokes the new worker, inspect failures and oldest pending deliveries, register owner/manager browser subscriptions (old staff subscriptions lack `staff_id`), and test real devices. Check database advisors before production: the isolated advisor command previously failed TLS negotiation; local role/ACL tests do not replace the hosted advisory scan.

Release requires explicit APK approval under AGENTS.md. Continuing development does not authorize publishing or replacing APK downloads.

## Native implementation follow-up

The native FCM receiver, sender, registration, acknowledgment and completion-control code have now been staged. See [native-notifications.md](native-notifications.md) for current verification and the unresolved Firebase account blocker; the earlier native gap above describes the state before this follow-up. Nothing has been activated in production.

Firebase project setup and real Android 15 background FCM delivery are now verified; see native-notifications.md for the resolved cloud blocker, remaining physical-device tests and rollout requirements.
