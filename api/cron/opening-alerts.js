import webpush from 'web-push';
import { backendHeaders, cronAuthorized, SB_URL } from '../../server/auth.js';

export async function deliverOpeningAlerts() {
  const rpc = async (name, body = {}) => {
    const response = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: backendHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Opening notification database request failed (${response.status})`);
    return response.json();
  };
  try {
    // Always collect durable owner alerts, including when push isn't configured.
    const deliveries = await rpc('app_claim_opening_notifications');
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { status: 503, error: 'Owner inbox updated; background push is not configured' };
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:reminders@momowala.co.in', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    let sent = 0, failed = 0;
    // Bounded batches keep one unreachable device from delaying all owners.
    for (let i = 0; i < deliveries.length; i += 10) {
      await Promise.all(deliveries.slice(i, i + 10).map(async d => {
        let ok = false, dead = false;
        try {
          await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            JSON.stringify({ title: d.title, body: d.body, tag: `opening-${d.id}`, url: '/' }), { TTL: 3600, timeout: 8000 });
          ok = true; sent++;
        } catch (e) { failed++; dead = [404, 410].includes(e.statusCode); }
        await rpc('app_finish_opening_notification', { p_id: d.id, p_endpoint: d.endpoint, p_lease: d.lease, p_sent: ok, p_dead: dead });
      }));
    }
    return { status: failed ? 503 : 200, sent, failed };
  } catch {
    return { status: 503, error: 'Opening notification delivery will retry on the next scheduled run' };
  }
}

export default async function handler(req, res) {
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const result = await deliverOpeningAlerts();
  return res.status(result.status).json(result);
}
