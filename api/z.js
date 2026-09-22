// Durable aggregator redirect:  /z/<cartId>  ->  that cart's Zomato listing.
//
// Printed QR boards must NEVER point straight at a Zomato OneLink. Those get
// regenerated when campaigns change, and a dead QR on a hanging board means
// reprinting every board at every cart. The QR points here instead, so the owner
// can update the link in the app and all existing boards keep working.
//
// ?v=swiggy switches vendor. Falls back to the cart's own menu page when no link
// is configured, so a scan is never a dead end.

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const safe = (u) => {
  // Only ever bounce to an http(s) URL — never a javascript:/data: payload that
  // a bad menus-blob write could otherwise turn into an open redirect.
  try {
    const p = new URL(String(u));
    return (p.protocol === 'https:' || p.protocol === 'http:') ? p.toString() : null;
  } catch { return null; }
};

export default async function handler(req, res) {
  const cartId = String(req.query?.c || req.query?.cartId || '').trim();
  const vendor = String(req.query?.v || 'zomato').toLowerCase() === 'swiggy' ? 'swiggy' : 'zomato';
  const home = cartId ? `/c/${encodeURIComponent(cartId)}` : '/';

  if (!cartId || !SB_URL || !SB_KEY) {
    res.setHeader('Location', home);
    return res.status(302).end();
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/menus?id=eq.1&select=data`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const rows = await r.json();
    const menus = Array.isArray(rows) && rows[0] ? rows[0].data : null;
    const link = safe(menus?.[cartId]?.vendorLinks?.[vendor]);
    // Short cache: a scan should be instant, but an updated link must go live
    // within minutes without anyone reprinting anything.
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.setHeader('Location', link || home);
    return res.status(302).end();
  } catch {
    res.setHeader('Location', home);
    return res.status(302).end();
  }
}
