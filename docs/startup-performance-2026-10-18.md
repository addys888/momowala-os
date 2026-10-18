# APK startup performance — 18 October 2026

Status: included in the user-approved 1.6.3 release (Android code 11).

## Causes addressed

- A global hydration gate hid login until twelve business-table/RPC reads (including paginated history) finished. A slow request could hold the login screen behind a spinner.
- Anonymous startup queried private business tables unnecessarily.
- A successful login was followed by a redundant identity request before data loading, then a lazy screen download after data finished.
- Hydration immediately triggered another order/stock download. Two online listeners could also trigger overlapping full refreshes for cart accounts.

## Changes

Login routes render independently of business-data hydration. Signed-out data loading uses only the public catalogue RPC; shopping routes still wait for that response. Authenticated data and report reads retain their scoped, complete loading behavior. Public responses do not replace private order/report caches with empty data.

Freshly authenticated sessions skip the redundant identity check; saved sessions still validate, and periodic identity validation remains. Role screen chunks preload alongside data. Initial duplicate order/stock reads and the competing reconnect refresh are removed; periodic and explicit refresh remain.

## Verification

- Real app-root startup tests in Android WebView: 5/5 passed on Android 15 and Android 7. The catalogue was deliberately left unresolved while checking login interactivity. Only one public request occurred. Shopping remained gated and then rendered once the catalogue completed.
- Login DOM readiness after React mount: 39 ms (Android 15), 183 ms (Android 7). These are isolated emulator UI measurements, **not** total cold-launch or real-network login benchmarks.
- Partner screen regression tests: 26/26 on Android 15.
- Application tests: 36/36.
- Internal debug Android build, lint and scheduling tests passed during implementation.

Reproduce startup tests: `npm run test:ui:android -- --startup` or add `--android7`. Evidence is in `.local-simulator/startup-android15` and `startup-android7`.

The native pre-login update-policy check remains unchanged. Authenticated history loading still depends on network speed and dataset size. Physical-phone performance and live post-login timings remain to be measured. The separate order-conflict retry issue is not addressed by this patch. No production business records were changed.
