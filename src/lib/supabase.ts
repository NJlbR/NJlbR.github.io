import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const primarySupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const fallbackSupabaseUrl = import.meta.env.VITE_SUPABASE_FALLBACK_URL;
const supabaseUrl = fallbackSupabaseUrl || primarySupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!primarySupabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const getProjectRef = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'default';
  }
};

export const supabaseAuthStorageKey = `sb-${getProjectRef(supabaseUrl)}-auth-token`;

const REQUEST_TIMEOUT_MS = 10000;

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithTimeout,
  },
  auth: {
    storageKey: supabaseAuthStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
