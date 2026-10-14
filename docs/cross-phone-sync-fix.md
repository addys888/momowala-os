# Cross-phone order sync — unreleased

A pending or rejected local order previously prevented the foreground poll from
merging any remote orders. The receiver now protects only IDs with outstanding
local order commands. Unrelated orders and newer committed revisions still merge.
Polling also fetches every page of the day's orders and rechecks on focus,
visibility restoration and reconnect. Responses from a changed session are ignored.

Verification: 26 JavaScript tests and 17 isolated database tests passed, including
separate logins for the same staff account, an order written by the first session
and read by the second, tenant isolation and independent logout. Regression tests
cover pending local edits, stale revisions, more than 1,000 orders and failed pages.

This does not send an offline phone's order before it reaches the server. Failed
outbox commands still need resolution; they are preserved, not discarded. The
foreground interval is 12 seconds. Background Firebase delivery is separate.

The installed APK bundles its screens, so this client fix needs an explicitly
approved APK release. No version bump, public APK replacement or deployment has
been made for this change. Real-device verification with two phones remains.
