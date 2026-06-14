# Momo Wala OS

**Cartlyft** is a multi-tenant QSR Operating System. One platform runs many food carts; **Momo Wala** (Saketpuri Yojna, Ayodhya) is the first cart on it. Four roles, three tiers:

- **Cartlyft Admin** (mobile `9452661608`) — the platform super-admin. Onboards QSR carts, assigns each cart's owner, resets owner passwords, enables/disables/removes carts, and sees per-cart reports across the whole platform.
- **Cart Owner** (one per cart) — runs a single cart: dashboard, inventory, **staff registry**, end-of-day reconciliation, 7-day reports — all scoped to that cart only.
- **Staff** — belong to one cart; log in with mobile + password and can only access their own cart's workplace. Order entry (cash/UPI), settle pending QR orders, shift summary.
- **Customer** — picks a cart from the marketplace listing, then self-orders → review → token. Orders start **pending**; stock and revenue update only after staff marks them paid.

Built with Vite + React. Data is saved to browser localStorage instantly (works offline) and synced to Supabase when configured. Hosted on Vercel.

### URLs & journeys

The app uses real routes (React Router), so every screen is bookmarkable and a cart's QR code can point straight at its menu.

| URL | Who | What |
| --- | --- | --- |
| `/` | public | Cart marketplace — lists active carts |
| `/c/:cartId` | public | A cart's menu + ordering (QR-code target, e.g. `/c/momowala`) |
| `/login` | owner + staff | **One login** — role auto-detected from the number; owner → `/manage`, staff → `/work` |
| `/manage` | owner | Owner console (dashboard, stock, reconcile, staff, reports) — guarded |
| `/work` | staff | Staff workplace (orders, pending, shift) — guarded |
| `/admin/login` → `/admin` | platform admin | Onboard & manage carts, per-cart reports — guarded |

Sessions persist across refresh; guarded routes bounce to the right login when there's no matching session. The customer marketplace links to the team login (header) and admin (footer).

### Tenancy & accounts

- **Every operational record is tagged with a `cartId`** — orders, inventory, stock logs, cart loadings, day-close reports, and staff. Owners and staff only ever see their own cart's data.
- The login screen has four entry points. The **cart is derived from the account**: a cart owner is whoever matches a cart's `ownerMobile`; a staff member's cart is on their record. No cart-picker needed.
- The Cartlyft admin number is fixed (`9452661608`, see `PLATFORM_ADMIN_MOBILE`). The admin sets a password on first login.
- When the admin onboards a cart, they assign the owner's mobile (and optionally an initial password — otherwise the owner sets it on first login). The owner then registers their own staff.
- An unregistered number cannot log in anywhere — it shows "not registered".
- Passwords are stored as SHA-256 hashes (never plain text), locally and in Supabase.

> **Note on shared menu:** all carts currently share the Momo Wala menu/recipe data (`MENU_ITEMS`). Per-cart menus are the next step when a second cart goes live for real.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
```

The app runs fine with no configuration — it just stays localStorage-only until Supabase keys are added.

## 1. Set up Supabase (one time)

1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine). Pick the Mumbai region (`ap-south-1`) for lowest latency from Ayodhya.
2. In the dashboard: **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), Run. The whole file is safe to re-run — if you already created the tables earlier, running it again applies the new `staff` table, the `pending` payment status, and the corn-cheese columns via the migration block at the bottom.
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
