import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variable');
}

// Supabase v2 uses navigator.locks (Web Locks API) when persistSession: true.
// In some Chrome profiles a stale lock causes auth.initialize() to hang forever,
// blocking getSession() and all RPC calls. A no-op lock bypasses this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lockNoOp = async (_n: string, _t: number, fn: () => Promise<any>) => fn()

// Auth + admin operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { lock: lockNoOp },
});

// Public read-only queries: skips auth initialization so data loads immediately
// even if auth.initialize() is slow or stuck in the background.
// Uses a separate storageKey to avoid "Multiple GoTrueClient instances" conflicts.
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'union-board-public-anon',
  },
});

export const SPACE_ID = import.meta.env.VITE_SPACE_ID as string;
export const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;

if (!SPACE_ID) {
  throw new Error('Missing VITE_SPACE_ID environment variable');
}
