import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null when env vars are missing — the app then runs on localStorage only
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
