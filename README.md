# Momo Wala OS

Cartlyft is a multi-cart restaurant operating system built with React, Vite, Supabase and Vercel. Customers order at `/c/:cartId`; staff use `/work`, owners `/manage`, and the platform admin `/admin`.

## Development and validation

```sh
npm ci
# Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm run dev
npm test
npm run build
```

Business operations require a configured database. Existing signed-in staff can queue changes offline; QR customers receive a token only after the server confirms their order. Browser storage must remain available until queued changes synchronize.

Database regression tests require an **isolated, disposable local PostgreSQL instance**, never a production database. With `initdb`, `pg_ctl` and `psql` on PATH:

```sh
npm run test:db:setup
npm run test:db
```

The setup script creates its own cluster in the OS temporary directory on localhost port 55439. Tests replace local fixture menus/inventory and clear local operation receipts. `TEST_PG_PORT` can override the port for both commands. Stop the cluster with the command printed by setup.

## Database and authentication

For a new database, run the complete `supabase/schema.sql` transaction. Existing databases use the incremental SQL in `supabase/migrations/`. Never apply only an old section of the baseline schema: it contains historical definitions superseded by the final security section.

The initial platform admin password must be provisioned privately by the database administrator; public first-login password claims are disabled. The authenticated platform admin sets owner passwords, and owners register staff. Existing password hashes remain compatible. Password resets invalidate affected sessions.

Custom application sessions are validated server-side through `x-app-session`. Row-level policies scope reads to the signed-in cart; customers have a random browser capability for their own orders. Direct browser writes are revoked. Validated RPC commands enforce roles, tenant boundaries, canonical menu prices, atomic stock accounting and conflict detection.

Every queued operation has a durable UUID. Retrying a lost response returns its existing receipt, preventing double stock deductions. Conflicting changes remain visible in the sync warning rather than silently overwriting another device. Use the warning's discard/reload action only after reviewing rejected changes; an archived copy remains in browser storage.

## Production services

Vercel requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. Menu extraction uses the configured Gemini key. Keep server secrets out of `VITE_` variables.

The database must contain the SHA-256 hash of the same `CRON_SECRET` in `app_private.backend_config` (id 1). The plaintext secret belongs only in server configuration. Rotate both together. Backend push/reminder access fails closed without this configuration; preserve existing scheduler jobs when migrating.

For coordinated security updates, build a production candidate with `vercel deploy --prod --skip-domain --yes`, apply the tested database migration, then promote the ready candidate with `vercel promote <deployment-url> --yes`. Refresh already-open phones after rollout. Old clients cannot write through the removed permissive table endpoints.

Check production catalog loading, denied unauthenticated private reads/API access, authenticated cart flows, database security advisors, and retained record counts after deployment. Run purchase/stock-changing tests against the isolated local database, not real customer accounts.

## Android app

A signed APK for Android 7+ is available at [the install page](https://momowala-os.vercel.app/install.html). See [Android build, signing, and update instructions](docs/android-app.md). Use `npm run build:android` to produce a signed release and Android App Bundle. Background push notifications require a future native Firebase integration; in-app order alerts work while the app is open.
