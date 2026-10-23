# Partner 1.7.10 (22)

Opening stock validation, persistent save feedback, daily owner loading history, weekly opening history, permanent database-assigned references, and IST submission timestamps on the owner home summary.

Production migration: 20261023151306_opening_load_reference.sql. Existing quantities and dates retained; reference numbers backfilled in submission order.

Validation: 41 app tests, 2 history tests, 43 local database tests; isolated partner web/Android builds; release lint; APK signature and package/version verification. Android 7 minimum retained. Emulator verification remains blocked by insufficient disk space.

Customer application work excluded from release staging. Existing production security advisor notices (private tables with no policies, custom-session SECURITY DEFINER RPCs, public pg_net extension) remain outside this change; no new table or RPC exposure added.
