import { readFile } from 'node:fs/promises';
import { SB_URL, dbHeaders } from '../server/auth.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const response = await fetch(`${SB_URL}/rest/v1/android_update_policy?select=minimum_version_code&id=eq.true`, {headers: dbHeaders(), signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('Policy unavailable');
    const rows = await response.json();
    const manifest = JSON.parse(await readFile(new URL('../public/downloads/latest.json', import.meta.url), 'utf8'));
    const minimumVersionCode = rows[0]?.minimum_version_code;
    if (!Number.isInteger(minimumVersionCode) || minimumVersionCode < 0 || minimumVersionCode > manifest.versionCode) throw new Error('Unpublished required version');
    return res.status(200).json({...manifest, minimumVersionCode});
  } catch { return res.status(503).json({error:'Update policy unavailable'}); }
}
