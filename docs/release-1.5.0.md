# Cartlyft Partner 1.5.0

User-authorized public release on 15 October 2026. Version code 7; Android 7/API 24 minimum; existing production signing key retained.

Includes the partner UI refresh documented in partner-ui-refresh.md: compact owner Home, daily readiness flag, packing within Daily operations, vendor settings in Cart settings, Stock opening history, simplified leave/holidays, date-based reconciliation viewing and grouped backup versions, and reports with a collection-mix donut. Report records and recovery copies are preserved. No database migration is required.

Validation: 34 Node tests; signed release APK/AAB build and release lint. Prior local UI verification at 320px and 360px covered every owner tab with fixture data and no runtime errors on a clean load. Android permission/channel status and audible/haptic behavior still need physical-phone verification. Existing Android 7 live-push and device-management limitations remain as documented in native-notifications.md.

Published deployment: dpl_8WVgADUtpKF5W8D7Yd9XKMHS6p9z. Public latest.json and install.html verified; APK download is 3,836,564 bytes with SHA-256 4dd177177149d1d45f079c4692d8af0b263da9824addbebaf6f98509777932da. Signing certificate matches the previous public releases.
