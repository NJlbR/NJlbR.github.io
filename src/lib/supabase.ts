import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const isPlaceholderValue = (value: string) =>
  !value ||
  value.includes('your-project-ref') ||
  value.includes('your-supabase-anon-key') ||
  value.includes('placeholder.supabase.co') ||
  value.includes('placeholder-anon-key');

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

export const isSupabaseConfigured = Boolean(
  !isPlaceholderValue(supabaseUrl) &&
    !isPlaceholderValue(supabaseAnonKey) &&
    isValidHttpUrl(supabaseUrl)
);

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

const memoryStorage = new Map<string, string>();

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : memoryStorage.get(key) ?? null;
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Fallback to in-memory storage when localStorage is unavailable
    }
    memoryStorage.set(key, value);
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // Fallback to in-memory storage when localStorage is unavailable
    }
    memoryStorage.delete(key);
  },
};

export const supabase = createClient<Database>(resolvedUrl, resolvedAnonKey, {
  auth: {
    storageKey: supabaseAuthStorageKey,
    storage: safeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
