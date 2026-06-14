// Vercel serverless function: extract a QSR menu from a photo using Claude vision.
// The Anthropic API key stays server-side (ANTHROPIC_API_KEY) — never shipped to the browser.
import Anthropic from '@anthropic-ai/sdk';

// The client downscales photos to ~1600px JPEG before upload, keeping the
// base64 body comfortably under Vercel's 4.5 MB request limit.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      description: 'Momo / dumpling style items that come in half and full portions',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          cat: { type: 'string', description: 'category e.g. Steamed, Kurkure, Tandoori, Fried' },
          type: { type: 'string', enum: ['veg', 'paneer', 'corn'], description: 'veg, paneer, or corn (corn cheese / cheese)' },
          half: { type: 'integer', description: 'half-plate price in rupees, 0 if not listed' },
          full: { type: 'integer', description: 'full-plate price in rupees, 0 if not listed' },
          pcsHalf: { type: 'integer', description: 'pieces in a half plate, 0 if unknown' },
          pcsFull: { type: 'integer', description: 'pieces in a full plate, 0 if unknown' },
          star: { type: 'boolean', description: 'true if marked as a bestseller / starred' },
        },
        required: ['name', 'cat', 'type', 'half', 'full', 'pcsHalf', 'pcsFull', 'star'],
      },
    },
    lassi: {
      type: 'array',
      description: 'Drinks, lassi, beverages — single price each',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, price: { type: 'integer' } },
        required: ['name', 'price'],
      },
    },
    addons: {
      type: 'array',
      description: 'Add-ons / extras (chutney, mayo, cheese). price 0 if free',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, price: { type: 'integer' } },
        required: ['name', 'price'],
      },
    },
  },
  required: ['items', 'lassi', 'addons'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });

  const { image, mediaType = 'image/jpeg' } = req.body || {};
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          {
            type: 'text',
            text: 'This is a photo of an Indian QSR (momo/chaat/snack) cart menu. Extract every menu item into the structured format. '
              + 'Momo-style items (anything with half/full portions) go in "items"; drinks/lassi/beverages go in "lassi"; '
              + 'extras/add-ons go in "addons". Read prices as integers in rupees (drop the ₹). If a price or piece count is not shown, use 0. '
              + 'For momo "type", choose veg, paneer, or corn (use corn for corn cheese / cheese variants). Mark star=true only if the item is visibly highlighted as a bestseller.',
          },
        ],
      }],
    });
    const text = response.content.find(b => b.type === 'text')?.text || '{}';
    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('extract-menu error', err);
    return res.status(502).json({ error: err.message || 'AI extraction failed' });
  }
}
