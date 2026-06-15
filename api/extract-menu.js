// Vercel serverless function: extract a QSR menu from a photo using
// Google Gemini 2.5 Flash (free tier). The API key stays server-side
// (GEMINI_API_KEY) — never shipped to the browser.
//
// Get a free key at https://aistudio.google.com/apikey and add it in Vercel:
//   vercel env add GEMINI_API_KEY production

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = `This is a photo of an Indian QSR (momo / chaat / snack) cart menu.
Extract EVERY menu item and return ONLY a JSON object with exactly this shape:

{
  "items":  [ { "name": string, "cat": string, "type": "veg" | "paneer" | "corn",
                "half": number, "full": number, "pcsHalf": number, "pcsFull": number, "star": boolean } ],
  "lassi":  [ { "name": string, "price": number } ],
  "addons": [ { "name": string, "price": number } ]
}

Rules:
- "items" = momo / dumpling style dishes that come in half & full portions.
  "cat" is the category (Steamed, Kurkure, Afghani, Tandoori, Fried, Cocktail, etc.).
  "type" is veg, paneer, or corn (use "corn" for corn cheese / cheese variants).
  Prices are integers in rupees (drop the ₹). Use 0 when a price or piece count is not shown.
  "star" is true only if the item is visibly highlighted as a bestseller.
- "lassi" = drinks / lassi / beverages (single price each).
- "addons" = extras / add-ons (chutney, mayo, cheese). price 0 if free.
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
    return res.status(200).json({
      items: Array.isArray(parsed.items) ? parsed.items : [],
      lassi: Array.isArray(parsed.lassi) ? parsed.lassi : [],
      addons: Array.isArray(parsed.addons) ? parsed.addons : [],
    });
  } catch (err) {
    console.error('extract-menu error', err);
    return res.status(502).json({ error: err.message || 'Menu extraction failed' });
  }
}
