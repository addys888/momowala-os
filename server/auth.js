export const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
export const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
export function dbHeaders(extra = {}) {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...extra };
}
export function backendHeaders() {
  if (!process.env.CRON_SECRET) throw new Error('Server authentication is not configured');
  return dbHeaders({ 'x-backend-secret': process.env.CRON_SECRET });
}
export async function identity(req) {
  const token = req.headers['x-app-session'];
  if (typeof token !== 'string' || !/^[\da-f-]{36}$/i.test(token)) return null;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/app_identity`, {
    method: 'POST', headers: dbHeaders({ 'x-app-session': token }), body: '{}',
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user?.role ? user : null;
}
export const cronAuthorized = req => !!process.env.CRON_SECRET &&
  (req.headers.authorization === `Bearer ${process.env.CRON_SECRET}` || req.query?.key === process.env.CRON_SECRET);
