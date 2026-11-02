# Counter workflow changes (unreleased)

- Manager New Order screen has a direct Log staff meal action. The dedicated page opens the existing database-backed form immediately; Stock retains access. Authorization remains the server-returned manager assignment and existing meal RPC checks.
- Owner order lists offer View all items for long orders. Item names, quantities and portions wrap in full. Staff payment and saved-order screens use the same bold item list.
- Saved-order confirmation stays open until Next order, with a scrollable item list for checking payment/customer handoff.
- Kitchen tab shows today's server-confirmed cart orders, oldest first, independently of payment. Chef selects Start preparing then Mark ready. Cashier sees the same persisted preparation statuses; unpaid orders remain in Pending for collection. Ready tab retains today's ready orders (it does not claim a separate delivered state). My shift remains accessible from New Order.
- Receipt and kitchen ticket tokens use a bold rounded 384-dot raster badge, with double-size text fallback when canvas is unavailable.

Validation: existing 44 tests, two counter UX tests and Vite production build passed. No production data was modified and no release/version change was made. Physical 58 mm printer compatibility and live cross-phone kitchen actions remain to be verified. Existing real-time refresh transport is reused, not replaced.
