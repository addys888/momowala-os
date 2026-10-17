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
const noStoreFetch = async (input, init = {}) => {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(requestHeaders())) {
    if (!headers.has(key)) headers.set(key, value);
  }
  // Bound stalled mobile connections. A timed-out write stays in the outbox
  // and retries with the same operation ID if the server already committed it.
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  init.signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 12000);
  try { return await fetch(input, { ...init, headers, cache: 'no-store', signal: controller.signal }); }
  finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
};
export const supabase = url && anonKey
  ? createClient(url, anonKey, { global: { fetch: noStoreFetch } })
  : null;
