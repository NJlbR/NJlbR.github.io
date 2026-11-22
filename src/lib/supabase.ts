import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const defaultUrl = 'https://fltqfhfnwvpmhsuaigrk.supabase.co';
const defaultKey = 'sb_publishable_cJ2B94qie1k6KZ0pdpABUg_sBrAm9kg';

const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const supabaseUrl = envUrl || defaultUrl;
const supabaseAnonKey = envKey || defaultKey;

const getProjectRef = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'default';
  }
};

export const supabaseAuthStorageKey = `sb-${getProjectRef(supabaseUrl)}-auth-token`;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: supabaseAuthStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
