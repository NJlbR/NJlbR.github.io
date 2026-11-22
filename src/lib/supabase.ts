import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Missing Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).'
  );
}

const getProjectRef = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'default';
  }
};

const resolvedUrl = supabaseUrl || 'https://placeholder.supabase.co';
const resolvedAnonKey = supabaseAnonKey || 'placeholder-anon-key';

export const supabaseAuthStorageKey = `sb-${getProjectRef(resolvedUrl)}-auth-token`;

export const supabase = createClient<Database>(resolvedUrl, resolvedAnonKey, {
  auth: {
    storageKey: supabaseAuthStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
