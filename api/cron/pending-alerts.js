import { backendHeaders, cronAuthorized } from '../../server/auth.js';
// Repeat "you have an unaccepted order!" pushes until staff acts.
//
// The instant push (api/notify-order) fires once when the customer places the
// order. If nobody accepts or rejects it, this job keeps re-ringing the cart's
// phones — the same behaviour as the Zomato/Swiggy partner apps. Schedule it
// every ~30-60s (Supabase pg_cron; see the setup notes in the README/schema).
//
// An order stops ringing as soon as acknowledged_at is set (staff tapped Accept
// or Reject) or the payment leaves 'pending' (settled/cancelled). Orders older
// than STALE_MIN stop ringing too, so one abandoned QR order can't buzz a phone
// for the rest of the day.

import webpush from 'web-push';
import { sendOrderPush } from '../notify-order.js';

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const STALE_MIN = 30;   // stop re-ringing an order nobody touched after this long
const MIN_AGE_SEC = 15; // don't double-ring the instant push

const sb = (path, init = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init,
  headers: { ...backendHeaders(), ...(init.headers || {}) },
});

export default async function handler(req, res) {
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'missing Supabase env' });
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({ error: 'missing VAPID env' });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:reminders@momowala.co.in',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  // Today in IST — orders carry an IST business date.
  const istDate = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const orders = await sb(
    `orders?date=eq.${istDate}&payment=eq.pending&source=eq.qr-order&acknowledged_at=is.null` +
    `&select=id,cart_id,token,total,items,inserted_at&order=id`,
  ).then((r) => r.json()).catch(() => null);

  if (!Array.isArray(orders)) return res.status(502).json({ error: 'order query failed' });

  const now = Date.now();
  const due = orders.filter((o) => {
    const t = Date.parse(o.inserted_at || '');
    if (!Number.isFinite(t)) return true; // no timestamp — ring it
    const ageSec = (now - t) / 1000;
    return ageSec >= MIN_AGE_SEC && ageSec <= STALE_MIN * 60;
  });

  const results = [];
  for (const o of due) {
    const itemCount = Array.isArray(o.items) ? o.items.reduce((s, i) => s + (i.qty || 0), 0) : 0;
    const r = await sendOrderPush(o.cart_id, o, itemCount);
    results.push({ orderId: o.id, cartId: o.cart_id, ...r });
  }

  return res.status(200).json({ date: istDate, unacknowledged: orders.length, rung: due.length, results });
}
