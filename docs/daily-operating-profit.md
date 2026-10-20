# Daily operating profit — 1.7.3

User decisions: charge **sold pieces only**, value unsold stock separately, and initialize only Momo Wala. Other carts configure their own profiles. Publishing was explicitly approved on 20 October 2026.

## Calculation

Momo Wala rates: veg ₹3/piece, paneer ₹5/piece, cheese corn (`corn`) ₹5/piece.

Fixed daily costs: rent/electricity ₹150 and labour ₹800 (300+300+200), total **₹950**. Variable costs for the reference sale of **500 veg + 300 paneer + 40 cheese corn = 840 pieces**: fresh cream ₹100; mayo ₹70; oil ₹200; gas ₹200; disposal ₹200; veggies ₹100; mocktail supplies ₹50; coal ₹30; butter ₹50; packing supplies ₹50; other ₹100. Reference variable total **₹1,150**. Each variable line is multiplied by actual sold reference-category pieces / 840 and rounded to paise. At 420 pieces oil is ₹100 and cream ₹50; at zero pieces all variable lines are zero. The shared usage estimate applies equally per momo piece across these categories; it does not claim independently measured ingredient usage per recipe. Owners can edit the reference quantities and line amounts.

Operating profit = paid logged sales − paid sold-piece cost − ₹950 fixed daily costs − sales-scaled supplies. Pending and cancelled orders are excluded. Cash, UPI, split and aggregator orders are included at their logged selling value, before platform commissions. Manager cash count is handover evidence, not automatically sales revenue. Reconciled cash/UPI remains preserved separately. This is an allocation-based operating result, not audited net profit.

Loaded quantity is the sum of CART_LOAD (including the opening load, whose ledger entries already exist); do not add opening_loads again. Paid sold pieces use immutable order stock_usage, rather than today's menu portions. The report also shows full loaded stock value and preparation allocation (loaded value + overhead), while charging only sold stock to profit. Closing counts determine the separately shown unsold value. Returns, adjustments, wastage, committed unpaid-order pieces and unexplained counted differences remain visible. Returned/wasted value is shown in movement details, not deducted again under the user's sold-only basis.

Existing Expenses are a purchase/cash-outflow ledger. They are not subtracted on top of these daily cost allocations. Owners can configure daily allocation lines, including additional lines, before closing. Unlisted platform fees, taxes, or other costs are not implicitly invented.

## Server flow and integrity

`cart_cost_profiles` stores effective dates, piece rates and daily allocation lines. `daily_profit_reports` stores the cost snapshot, source closing, calculated details, revision and update time. Both tables have RLS with owner/admin scoped reads; writes pass through checked functions. Staff cannot read financial results or change costs.

A manager's confirmed closing submission or an owner/admin reconciliation with closed_at makes the day eligible. Opening stock, elapsed closing time, an unsaved form, and pending local sync do not qualify. Deferred database triggers calculate after transaction changes finish, so the result shares the closing transaction's durability and avoids taking a profit lock before subsequent inventory mutations. A per-cart/date advisory lock serializes concurrent report refreshes. The read RPC can populate reports for historical confirmed closes without relying on a phone cache or scheduled client job.

Order payments/cancellations, load/wastage corrections and reconciliation corrections refresh eligible results. Closed cost snapshots remain fixed even when future settings change. Missing rates can be completed explicitly; a missing profile produces needs_costs, not fabricated profit. Manual-only sales or missing saved order usage yield incomplete results with no finalized profit. Holidays have no operating allocation. Missing physical closing counts stay unknown and are not presented as zero counts.

## UI

Home shows a compact Daily operating profit link below daily collections. Reports → Daily profit provides a date selector, four financial metrics, stock comparison, movement detail and overhead breakdown. Configure costs separates fixed costs, reference quantities, and variable reference-batch costs and saves an effective-date profile with optimistic revision protection. Failed saves keep the entered values. The first Momo Wala seed takes effect on the deployment's IST calendar date; earlier dates require explicit configuration. Existing report data is not deleted or rewritten by seeding.

## Release integration

Apply `20261019182611_daily_operating_profit.sql` only as part of the approved deployment (along with pending `20261019180950_closing_settings_defaults.sql`). Verify Momo Wala’s cost seed has fixed 950, reference variable 1150, and reference pieces 840, cross-cart permissions, and a safely isolated closing-to-report flow. The two migrations were applied for the approved release. The live Momo Wala seed was verified; no live orders or closing submissions were created for testing. Physical-phone speaker loudness and production closing end-to-end verification remain outstanding. Release welcome code 15 includes the new profit feature; ensure this matches the eventual approved Android version code.

## Verification completed

43 isolated database tests passed, including close gating, manager and reconciliation paths, default overhead arithmetic, sold-only cost, unsold/preparation values, unpaid/cancelled orders, late concurrent sales, frozen historical rates, manual incomplete days, missing-rate completion, tenant isolation and denied direct writes. The 37 unit tests passed. Android debug build/lint passed; 39 UI scenarios passed on both Android 7 and Android 15. Cost-save failure retains values; pre-close days show no profit; the compact two-column metrics and horizontally contained stock table were checked on old WebView. Android 7 screenshot was visually reviewed. All fixture orders and closes were local only.
