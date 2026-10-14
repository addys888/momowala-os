import { identity, backendHeaders } from '../server/auth.js';
// Stores a browser push subscription (keyed by endpoint) against a cart + role,
// so the reminder cron can send to it later. Uses the Supabase REST API with the
// anon key plus a server-only secret validated by the database policy.

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Server is missing Supabase env' });

  const { subscription, cartId, native } = req.body || {};
  if (!subscription?.endpoint || !cartId) return res.status(400).json({ error: 'Missing subscription or cartId' });

  const user = await identity(req);
  if (!user || !['owner', 'staff', 'admin'].includes(user.role) || (user.role !== 'admin' && user.cartId !== cartId)) return res.status(403).json({ error: 'Not authorised' });
  if(native) {
    if(!/^fcm:[A-Za-z0-9_:-]{20,4096}$/.test(subscription.endpoint) || !/^[a-f0-9-]{36}$/.test(subscription.binding || '')) return res.status(400).json({error:'Invalid native registration'});
  }
  let endpoint;
  if(!native) {
  try { endpoint = new URL(subscription.endpoint); } catch { return res.status(400).json({ error: 'Invalid push endpoint' }); }
  if (endpoint.protocol !== 'https:' || !/(^|\.)(fcm.googleapis.com|push.services.mozilla.com|web.push.apple.com|notify.windows.com)$/.test(endpoint.hostname)) return res.status(400).json({ error: 'Unsupported push endpoint' });
  }
  const row = {
    endpoint: subscription.endpoint,
    cart_id: cartId,
    role: user.role === 'staff' ? 'staff' : 'owner',
    staff_id: user.role === 'staff' ? user.staffId : null,
    p256dh: native ? subscription.binding : subscription.keys?.p256dh || null,
    auth: native ? null : subscription.keys?.auth || null,
    updated_at: new Date().toISOString(),
  };

  const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
    method: 'POST',
    headers: {
      ...backendHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) return res.status(500).json({ error: 'DB write failed', detail: await r.text() });
  return res.status(200).json({ ok: true, ...(native ? { deliveryReady: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON } : {}) });
}
