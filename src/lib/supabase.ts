import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variable');
}

// Auth + admin operations (waits for auth initialization)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Public read-only queries: skips auth initialization so data loads immediately
// even if auth.initialize() is slow or stuck in the background.
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export const SPACE_ID = import.meta.env.VITE_SPACE_ID as string;
export const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;

if (!SPACE_ID) {
  throw new Error('Missing VITE_SPACE_ID environment variable');
}
