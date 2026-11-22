import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const stripQuotes = (value: string) => value.trim().replace(/^['"]|['"]$/g, '').trim();

const normalizeSupabaseUrl = (rawUrl: string): string => {
  const cleaned = stripQuotes(rawUrl);
  if (!cleaned) return '';

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    const cleanPath = parsed.pathname
      .replace(/\/(rest|auth|storage|functions|realtime)\/v1.*$/i, '')
      .replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
};

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = stripQuotes(import.meta.env.VITE_SUPABASE_ANON_KEY || '');

const isPlaceholderValue = (value: string) =>
  !value ||
  value.includes('your-project-ref') ||
  value.includes('your-supabase-anon-key') ||
  value.includes('placeholder.supabase.co') ||
  value.includes('placeholder-anon-key');

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    !isPlaceholderValue(supabaseUrl) &&
    !isPlaceholderValue(supabaseAnonKey)
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
