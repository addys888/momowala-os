// Stores a browser push subscription (keyed by endpoint) against a cart + role,
// so the reminder cron can send to it later. Uses the Supabase REST API with the
// anon key (the push_subscriptions table has a permissive policy like the rest).

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Server is missing Supabase env' });

  const { subscription, cartId, role } = req.body || {};
  if (!subscription?.endpoint || !cartId) return res.status(400).json({ error: 'Missing subscription or cartId' });

  const row = {
    endpoint: subscription.endpoint,
    cart_id: cartId,
    role: role || 'owner',
    p256dh: subscription.keys?.p256dh || null,
    auth: subscription.keys?.auth || null,
    updated_at: new Date().toISOString(),
  };

  const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) return res.status(500).json({ error: 'DB write failed', detail: await r.text() });
  return res.status(200).json({ ok: true });
}
