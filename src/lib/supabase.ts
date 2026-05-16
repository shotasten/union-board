import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variable');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const SPACE_ID = import.meta.env.VITE_SPACE_ID as string;
export const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;

if (!SPACE_ID) {
  throw new Error('Missing VITE_SPACE_ID environment variable');
}
