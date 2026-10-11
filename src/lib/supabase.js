import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function requestHeaders() {
  const headers = {};
  try {
    const session = JSON.parse(localStorage.getItem('mw:session') || 'null');
    if (session?.token && session.expiresAt > Date.now()) headers['x-app-session'] = session.token;
    let key = localStorage.getItem('mw:customerKey');
    if (!key) { key = crypto.randomUUID(); localStorage.setItem('mw:customerKey', key); }
    headers['x-customer-key'] = key;
  } catch { /* private storage unavailable: authenticated writes fail closed */ }
  return headers;
}
const noStoreFetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(requestHeaders())) headers.set(key, value);
  return fetch(input, { ...init, headers, cache: 'no-store' });
};
export const supabase = url && anonKey
  ? createClient(url, anonKey, { global: { fetch: noStoreFetch } })
  : null;
