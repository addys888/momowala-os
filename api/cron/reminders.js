// Reminder cron. Runs every ~15 min (see vercel.json crons). For each active
// cart it checks IST time against openTime/closeTime and sends a web-push to the
// cart's subscribers (owner + on-duty staff):
//   • 1 hour BEFORE opening  → "load stock onto the cart"
//   • AT closing time        → "reconcile the day"
// A reminder_sends row (unique cart_id+date+kind) makes each send once-per-day.

import webpush from 'web-push';

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const WINDOW_MIN = 20; // must be >= the cron interval so a slot is never missed

const sb = (path, init = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
});

const parseMin = (t) => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export default async function handler(req, res) {
  // Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Also allow
  // `?key=<CRON_SECRET>` so an external scheduler can trigger it if needed.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const ok = req.headers.authorization === `Bearer ${secret}` || req.query?.key === secret;
    if (!ok) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'missing Supabase env' });
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) return res.status(500).json({ error: 'missing VAPID env' });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:reminders@momowala.co.in', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  // Test fire: ?test=<cartId> sends a sample push to that cart's subscribers now,
  // bypassing the time window and dedupe. Secret-guarded (above). For setup only.
  if (req.query?.test) {
    const cartId = req.query.test;
    const subs = await sb(`push_subscriptions?cart_id=eq.${encodeURIComponent(cartId)}&select=endpoint,p256dh,auth`).then(r => r.json());
    const payload = JSON.stringify({ title: '🔔 Cartlyft test', body: 'Reminders are working — you\'ll get load-stock & reconcile alerts.', tag: `test-${Date.now()}`, url: '/' });
    let ok = 0, bad = 0;
    for (const s of subs || []) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); ok++; }
      catch { bad++; }
    }
    return res.status(200).json({ test: true, cartId, subscriptions: (subs || []).length, sent: ok, failed: bad });
  }

  // "Now" in IST (UTC+5:30) — Vercel cron fires in UTC.
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const istDate = ist.toISOString().slice(0, 10);
  const istMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();

  const [carts, subs, sends] = await Promise.all([
    sb('carts?select=id,name,open_time,close_time,active').then(r => r.json()),
    sb('push_subscriptions?select=endpoint,cart_id,role,p256dh,auth').then(r => r.json()),
    sb(`reminder_sends?date=eq.${istDate}&select=cart_id,kind`).then(r => r.json()),
  ]);
  const already = new Set((sends || []).map(s => `${s.cart_id}:${s.kind}`));
  const inSlot = (target) => target != null && istMin >= target && istMin < target + WINDOW_MIN;

  const due = [];
  for (const c of carts || []) {
    if (c.active === false) continue;
    if (inSlot(parseMin(c.open_time) != null ? parseMin(c.open_time) - 60 : null)) due.push({ cart: c, kind: 'load' });
    if (inSlot(parseMin(c.close_time))) due.push({ cart: c, kind: 'reconcile' });
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const d of due) {
    if (already.has(`${d.cart.id}:${d.kind}`)) { skipped++; continue; }
    const targets = (subs || []).filter(s => s.cart_id === d.cart.id);
    const payload = d.kind === 'load'
      ? { title: `⏰ ${d.cart.name}: opening in 1 hour`, body: 'Load momo stock onto the cart and hand over plates & glasses.', tag: `load-${d.cart.id}-${istDate}`, url: '/' }
      : { title: `🌙 ${d.cart.name}: closing time`, body: 'Reconcile the day — count cash, stock, plates & glasses.', tag: `recon-${d.cart.id}-${istDate}`, url: '/' };

    for (const s of targets) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
        sent++;
      } catch (e) {
        failed++;
        if (e.statusCode === 404 || e.statusCode === 410) {
          await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }); // prune dead subscription
        }
      }
    }
    // Mark as sent for today (unique cart_id+date+kind) so we never double-send.
    await sb('reminder_sends', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ cart_id: d.cart.id, date: istDate, kind: d.kind, sent_at: new Date().toISOString() }) });
  }

  return res.status(200).json({ ok: true, istDate, istMin, due: due.length, sent, failed, skipped });
}
