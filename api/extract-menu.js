// Vercel serverless function: extract a QSR menu from a photo using
// Google Gemini 2.5 Flash (free tier). The API key stays server-side
// (GEMINI_API_KEY) — never shipped to the browser.
//
// Get a free key at https://aistudio.google.com/apikey and add it in Vercel:
//   vercel env add GEMINI_API_KEY production

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = `This is a photo of an Indian street-food / QSR menu. It could be ANY cuisine —
momos, dosa, chaat, rolls, chinese, south-indian, etc. Do NOT assume it is momos.
Read the menu as it actually is. Extract EVERY item and return ONLY a JSON object
with exactly this shape:

{
  "menuLabel": string,   // the cart's main food category in ONE or TWO words, taken
                         // from the menu itself (e.g. "Dosa", "Momos", "Rolls",
                         // "Chaat", "Chinese"). If unclear, use "Menu".
  "menuEmoji": string,   // one emoji that fits the cuisine (🥟 momos, 🫓 dosa,
                         // 🌯 rolls, 🍜 chinese, 🍧 chaat). Default 🍽️.
  "items":  [ { "name": string, "cat": string, "type": "veg" | "nonveg" | "egg" | "paneer" | "corn" | "",
                "single": boolean, "half": number, "full": number,
                "pcsHalf": number, "pcsFull": number, "star": boolean } ],
  "lassi":  [ { "name": string, "price": number } ],
  "addons": [ { "name": string, "price": number } ]
}

Rules:
- "items" = the main food dishes of this cart, whatever the cuisine.
  "cat" is the section heading the item sits under ON THIS MENU (e.g. "Plain Dosa",
  "Masala Dosa", "Uttapam", "Steamed", "Tandoori"). Use the menu's own wording — never
  invent momo categories for a non-momo menu.
  "type" — set "veg" / "nonveg" / "egg" / "paneer" / "corn" only when the menu clearly
  shows it (a red/green dot, the words, or an obvious paneer/corn/egg/chicken dish).
  If the menu gives no veg/non-veg signal, use "".
  PRICING — look carefully at how each dish is priced:
    • If the dish has TWO prices (half & full / small & large / single & double portions),
      set "single": false, put the two prices in "half" and "full", and the piece counts
      in "pcsHalf"/"pcsFull" if shown (else 0).
    • If the dish has ONE price (the normal case for dosa, rolls, chaat, most cuisines),
      set "single": true, put that price in "full", "half": 0, and leave pcsHalf/pcsFull 0
      unless a piece count is printed.
  Prices are integers in rupees (drop the ₹). Use 0 when a number isn't shown.
  "star" is true only if the item is visibly highlighted as a bestseller / recommended.
- "lassi" = drinks / beverages / lassi (single price each).
- "addons" = extras / add-ons (chutney, mayo, cheese, extra). price 0 if free.
Return valid JSON only — no markdown, no commentary.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });

  const { image, mediaType = 'image/jpeg' } = req.body || {};
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    const r = await fetch(`${ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType, data: image } },
            { text: PROMPT },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || `Gemini error ${r.status}`;
      return res.status(502).json({ error: msg });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!text) return res.status(502).json({ error: 'Gemini returned no content (image may have been blocked)' });

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // strip any stray code fences just in case
      const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(cleaned);
    }
    // Normalise items: derive `single` when the model omits it (one price = single),
    // and keep half/full consistent so the ordering UI renders the right buttons.
    const items = (Array.isArray(parsed.items) ? parsed.items : []).map(it => {
      const half = Number(it.half) || 0, full = Number(it.full) || 0;
      const single = it.single != null ? !!it.single : half === 0;
      return {
        name: it.name, cat: it.cat, type: it.type || '', star: !!it.star,
        single,
        half: single ? 0 : half,
        full: single ? (full || half) : full,
        pcsHalf: single ? 0 : (Number(it.pcsHalf) || 0),
        pcsFull: Number(it.pcsFull) || 0,
      };
    });
    return res.status(200).json({
      menuLabel: typeof parsed.menuLabel === 'string' ? parsed.menuLabel : '',
      menuEmoji: typeof parsed.menuEmoji === 'string' ? parsed.menuEmoji : '',
      items,
      lassi: Array.isArray(parsed.lassi) ? parsed.lassi : [],
      addons: Array.isArray(parsed.addons) ? parsed.addons : [],
    });
  } catch (err) {
    console.error('extract-menu error', err);
    return res.status(502).json({ error: err.message || 'Menu extraction failed' });
  }
}
