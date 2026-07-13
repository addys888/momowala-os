import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Force every request to bypass the browser HTTP cache. Some mobile browsers
// aggressively cache GETs, so the app would keep showing stale orders/revenue
// even after a reload (one device stuck "1 order behind" another). no-store
// guarantees each load/poll fetches the live data from Supabase.
const noStoreFetch = (input, init = {}) => fetch(input, { ...init, cache: 'no-store' });

// null when env vars are missing — the app then runs on localStorage only
export const supabase = url && anonKey
  ? createClient(url, anonKey, { global: { fetch: noStoreFetch } })
  : null;
