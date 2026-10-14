# Partner flow review — 14 October 2026 (unreleased)

Scope: owner and staff trading-day journey, with durable saving, cross-phone
updates, payment collection, printing, opening/closing stock and staff records.
No production records, deployment, public APK or Android version were changed.

## Fixed

| Problem | Change and evidence |
| --- | --- |
| A queued order freezes all incoming orders | Merge by order ID while protecting local edits; pagination beyond 1,000; four sync regressions. |
| Menus, opening hours, reports and old unpaid orders stay stale | Full scoped refresh every minute while visible and on focus/reconnect; lightweight current-day polling remains 12 seconds. Ignore reads overtaken by local queue changes. |
| Accepting a QR order enqueues acknowledgment twice | Removed the duplicate direct enqueue; the existing state-change command is the single durable write. |
| Storage failure still clears the basket | State updates report failure; new/add-item order forms retain their input. Multiple commands use one local storage entry. |
| Stock transfers/wastage/day-close save separate records and stock changes | New `app_mutate_batch` transaction delegates to existing authorized commands; any error rolls back all writes. Stable batch receipt prevents duplicate retries. Tested insufficient stock, cross-cart denial and rollback. |
| Closing from two phones duplicates reports or overwrites a newer stock count | Date-scoped lock and duplicate-date rejection; expected counts guard absolute stock resets. Tests cover duplicate dates and stale recount rollback. |
| Kitchen tickets print with “Waiting to sync”, then print twice | Automatic print waits for the server revision and tracks the printed order ID during the confirmation; unsynced confirmation says it is saved on this phone. Manual reprint remains available. |
| Logout RPC is not awaited; account changes can affect in-flight work | Execute logout with the captured session header, preserve explicit request headers, and suppress old-account committed events. Queue regression covers switching accounts before response. |
| Negative/fractional close quantities silently become report values | Require nonnegative whole cash, UPI and piece-count values before close. |
| Day rollover can reuse prior opening-readiness state | Bind loaded readiness to cart and business date. |
| Cancellation window inferred only from a phone-generated ID | Prefer the server insertion timestamp after sync. |
| Lint tries to inspect generated Android bundles | Exclude build outputs and copied web assets; source lint findings remain visible. |

## Verification

- 28 unit/API tests and 20 isolated PostgreSQL tests passed.
- Browser: staff login, unpaid counter order, split payment (cash 20 + UPI 15),
  My Orders and owner totals; owner stock transfer from freezer 150/cart 15 to
  freezer 140/cart 25, confirmed in the database with its 10-piece audit record.
  Day-close then returned those 25 pieces (freezer 165/cart 0), saved its report,
  and remained closed after reload. A negative cash amount kept Close disabled.
- Browser navigation covers owner dashboard, stock, staff registry/attendance,
  reconciliation and reports. This is a focused smoke pass, not exhaustive UI automation.
- Android internal debug/test builds, Android lint and Java alarm-date tests pass.
- Android 7 emulator: RawBT routing and byte preservation, scheme/subframe guards,
  update-manifest/tampered APK rejection, actual scheduled notification, completion
  cancellation and logout-independent assignment pass. The instrumentation wait
  now observes notification arrival with a 15-second bound instead of assuming 3.5 seconds.
- Whole-source ESLint is not clean: the legacy code has extensive unused imports,
  mixed component exports and hook-rule findings. No parser/undefined-variable errors
  were found in the scoped source check. Changed-file errors decreased from 365 to 362. This review does not claim a clean lint gate.

The Supabase CLI advisor could not connect to the isolated PostgreSQL instance
because it insisted on TLS (including with `sslmode=disable`). Direct SQL checks
confirmed the new function has a fixed search path, no PUBLIC/authenticated execute
grant, and only the intended anon entry point; role/cart denial is covered by tests.
The full advisor report remains a pre-deployment check.

## Release/integration gates

1. Deploy `20261013150132_partner_atomic_changes.sql` before publishing the updated
   website or APK. It has only been applied to the isolated local database. Old APK
   commands remain supported, but gain the new batch protections only after upgrade.
2. Explicit APK release approval is still required. No public download was replaced.
3. Physical printer output, two physical phones, Android 8–15 notification permissions,
   OEM battery restrictions and signed upgrade testing remain release checks.
4. Firebase cross-phone background updates remain unconfigured. Local opening alarms
   work; another phone's completion/opening-time changes need a foreground refresh.
   Native closing alarms are still not implemented. These are existing integration/
   feature gaps, not covered by the successful foreground-sync tests.
5. Offline/rejected changes remain on the originating phone until accepted by the
   server. This pass does not recover missing historical production figures or
   silently resolve conflicting financial records.
