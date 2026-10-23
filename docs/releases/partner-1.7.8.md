# Partner 1.7.8 (code 20)

Explicitly approved deployment/publication. Adds category-wise server stock comparison before manager closing. Missing/extra counts warn before confirmation; unresolved variance requires notes. Checked submission locks inventory, rejects changed expectations, stores expected quantities and leaves stock/sales unchanged. Owners see expected versus physical counts in saved reports.

Migration closing_stock_variance applied to production; RPC registration/grant verified. Legacy APK submission RPC retained for compatibility; older versions do not receive this new check. Archived-day checks use retained stock rollover snapshots; unavailable expectations block checked submission with owner-review guidance.

Validation: targeted local SQL checks for expected counts, missing-note rejection, stale expectation rejection, idempotent retry, persisted expectation and unchanged inventory. Category missing/extra/zero unit tests pass. Signed release compilation/signature passed; Android lint 0 errors, 15 warnings. New closing form not tested on a physical phone. Partner-only web staging excludes unfinished customer work. Minimum version policy unchanged.
