# Partner UI refresh — released in 1.5.0

Implemented 15 October 2026; subsequently published with explicit user approval as 1.5.0 / code 7. No database migration or report-data changes were required. See release-1.5.0.md.

Home now focuses on collected revenue, daily operations, a compact authoritative opening-stock flag, and readable live stock. Packing is inside Daily operations. Detailed opening alerts and serving-supply recounts are in Stock. Vendor switches and QR printing are in Cart settings. The availability switch follows existing scheduled-hours enforcement, with an information disclosure for hours.

Healthy Android notification registration now shows a compact settings link instead of a permanent explanation panel. Registration continues on every owner tab. Native status checks the actual partner notification channel as well as app permission. Connection failures remain visible. The native About text no longer incorrectly says background push is unavailable.

Reconciliation has one business-date navigator and displays saved cash/UPI totals for a selected closed day. Recovery starts collapsed, groups backups by date, and explicitly presents multiple versions without deleting or automatically restoring them. Leave/holidays emphasize monthly recorded days; employment details and leave entry are expandable.

Reports retain the existing counted-money totals and history. Collection mix is an SVG donut with numeric labels and an empty state. The recorded-order average now excludes manual reconciliation amounts that have no corresponding recorded order count; covered by a dedicated test. Daily records remain accessible in a disclosure. Partner-only color tokens replace yellow/black styling; customer theme stays separate.

Validation: 34 Node tests passed; internal Android debug/test APK build, Android lint, and opening schedule checks passed. Local fixture UI reviewed at 360px and 320px; no page-level overflow. Fresh browser navigation through all owner screens had no console errors. Saved fixture reconciliation (cash 3560, UPI 3050) remained in monthly collections and accessible by date. These were isolated UI fixtures, not production-account edits. Existing broad legacy lint warnings remain; focused changed notification/recovery components pass lint. Physical-device permission/settings rechecks still need a handset test. The initial review build stayed internal; the subsequent approved release is documented separately.
