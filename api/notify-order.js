import { backendHeaders, dbHeaders } from '../server/auth.js';
// Instant "new customer order" push. Called by the customer's browser the moment
// a QR order is placed, so the cart's staff/owner phones ring within a second or
// two instead of waiting for a cron tick.
//
// Anti-spam: the order must actually EXIST in the database, belong to the given
// cart, still be unpaid ('pending') and not yet acknowledged. The client writes
// the row (insertOrderNow) just before calling this, but replication/sync can lag
// a beat, so we retry the lookup briefly before giving up.

import webpush from 'web-push';

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const sb = (path, init = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init,
  headers: { ...backendHeaders(), ...(init.headers || {}) },
});

// Shared with the repeat cron so both rings look identical on the phone.
export function orderPushPayload(order, role) {
  const items = Number(order.item_count ?? 0);
  return JSON.stringify({
    title: `🔔 New order #${order.token}`,
    body: `${items > 0 ? `${items} item${items > 1 ? 's' : ''} · ` : ''}₹${order.total} — tap to accept or reject`,
    // Same tag per order → the phone replaces (not stacks) repeat rings, and
    // renotify makes each replacement buzz again.
    tag: `order-${order.id}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 700],
    url: role === 'owner' ? '/manage' : '/work',
  });
}

export async function sendOrderPush(cartId, order, itemCount) {
  const subs = await sb(`push_subscriptions?cart_id=eq.${encodeURIComponent(cartId)}&select=endpoint,role,p256dh,auth`)
    .then((r) => r.json()).catch(() => []);
  let sent = 0, failed = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        orderPushPayload({ ...order, item_count: itemCount }, s.role),
      );
      sent++;
    } catch { failed++; }
  }
  return { subscriptions: (subs || []).length, sent, failed };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'missing Supabase env' });
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({ error: 'missing VAPID env' });
  }

  const { cartId, orderId, itemCount } = req.body || {};
  if (!cartId || !orderId) return res.status(400).json({ error: 'Missing cartId or orderId' });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:reminders@momowala.co.in',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const claimed = await fetch(`${SB_URL}/rest/v1/rpc/app_claim_notification`, {
    method: 'POST',
    headers: dbHeaders({ 'x-customer-key': req.headers['x-customer-key'] || '', 'x-app-session': req.headers['x-app-session'] || '' }),
    body: JSON.stringify({ p_order: orderId }),
  });
  if (!claimed.ok) return res.status(403).json({ error: 'Not authorised' });
  const order = await claimed.json();
  if (!order) return res.status(200).json({ skipped: true });
  if (order.cart_id !== cartId) return res.status(400).json({ error: 'Cart mismatch' });
  const result = await sendOrderPush(cartId, order, Number(itemCount ?? 0));
  return res.status(200).json({ ok: true, orderId: order.id, ...result });
}
