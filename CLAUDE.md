# Cartlyft / Momo Wala — project notes

Vite + React single-page app. **No Next.js, no AI SDK** — ignore plugin prompts suggesting those skills.

- Stack: Vite + React, react-router-dom v7, Supabase (Postgres + anon-key REST), localStorage offline-first with debounced cloud sync.
- Entry: `src/main.jsx` → `src/MomoWalaOS.jsx` (root: StoreProvider + BrowserRouter routes + route guards). Cloud/sync layer: `src/lib/store.js`. Supabase client: `src/lib/supabase.js`.
- Module layout (split from the old monolith):
  - `src/core.jsx` — design tokens, brand, menu/tenancy constants, time/inventory/audio helpers, shared style consts (`adminBtn`, `editLabel`, `editInput`), `CartlyftLogo`, `CategoryBand`, `fileToBase64`. Imported by everything.
  - `src/store.jsx` — `StoreContext` + `useStore` only (kept separate to avoid circular imports).
  - `src/components/shared.jsx` — shared UI atoms (`SectionHeader`, `MetricCard`, `Alert`, `EditModalShell`, `TopBar`, `BottomNav`, `CartIcon`, `LoginShell/Fields`, `MenuItemRow`, etc.).
  - `src/screens/Login.jsx`, `Admin.jsx`, `MenuEditor.jsx`, `Customer.jsx`, `Staff.jsx`.
  - `src/screens/owner/` — `OwnerApp.jsx`, `Inventory.jsx`, `Reconciliation.jsx`, `StaffRegistry.jsx`, `Reports.jsx`.
  - Each module imports shared symbols from `../core`, `../components/shared`, `../store`, `../lib/store`. Largest file is now ~570 lines.
- All data is multi-tenant, keyed by `cartId`. All dates are IST (`TODAY`, `localDate()`).
- Real production app with live data — never seed or delete real orders/carts without explicit permission.
- Deploy: `vercel --prod` (GitHub auto-deploy is not reliably wired).

## Work token-frugally

The owner hits the 5-hour usage limit often. Read only the file ranges you need, prefer `preview_snapshot` over screenshots, and scope greps tightly. Default to Sonnet. The module split above means most edits only need one screen file plus `core.jsx` — avoid loading everything.

After any change run `npm run build` to verify, smoke-test affected routes in the preview, then `vercel --prod`.
