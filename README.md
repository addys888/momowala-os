# Momo Wala OS

Cart management app for Momowala (Saketpuri Yojna, Ayodhya). Three roles in one app:

- **Owner** — dashboard, inventory, end-of-day reconciliation, 7-day reports
- **Staff** — order entry (cash/UPI), shift summary
- **Customer** — QR self-order menu with token numbers

Built with Vite + React. Data is saved to browser localStorage instantly (works offline) and synced to Supabase when configured. Hosted on Vercel.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
```

The app runs fine with no configuration — it just stays localStorage-only until Supabase keys are added.

## 1. Set up Supabase (one time)

1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine). Pick the Mumbai region (`ap-south-1`) for lowest latency from Ayodhya.
2. In the dashboard: **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), Run.
3. Go to **Project Settings → API** and copy two values:
   - Project URL
   - `anon` `public` key
4. Locally:
   ```bash
   cp .env.example .env.local
   # paste the two values into .env.local
   ```
5. Restart `npm run dev` — orders now appear in the Supabase **Table Editor** a second or two after they're placed.

> **Security note:** v1 has no logins, so the schema gives the anon key full read/write (see the RLS section at the bottom of `schema.sql`). Fine for a single-cart pilot; add Supabase Auth before sharing the URL beyond your own staff.

## 2. Deploy to Vercel

```bash
vercel login                 # one time
vercel link                  # one time — create new project "momowala-os"

# add the same two env vars for the deployed app (paste value when prompted)
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production

vercel --prod                # deploy
```

Vercel auto-detects Vite — no config file needed. For automatic deploys on every push, create a GitHub repo, push, and import it at [vercel.com/new](https://vercel.com/new) instead of using `vercel --prod`.

## 3. Put it on the cart

Open the production URL in Chrome on the cart phone → ⋮ menu → **Add to Home screen**. Print the customer URL as a QR code for the self-order menu.

## Data model

| Table | What it holds |
| --- | --- |
| `orders` | every sale (staff entry or QR order), items as JSON |
| `stock_logs` | supplier deliveries |
| `cart_loadings` | freezer → cart stock movements |
| `day_close_logs` | end-of-day reconciliation reports |
| `inventory` | single-row live stock snapshot (JSON) |

All event tables are insert-once, keyed by the app's `Date.now()` ids; the app merges cloud + local data on load, so the same data can be viewed from multiple devices.

## Known v1 limitations

- Customer QR orders are recorded as paid UPI without payment verification
- No role locks — anyone with the URL can open the Owner console
- Token numbers can clash if two devices take orders at the same moment
