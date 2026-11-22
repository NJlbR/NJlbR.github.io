import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const getProjectRef = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'default';
  }
};

export const supabaseAuthStorageKey = `sb-${supabaseUrl ? getProjectRef(supabaseUrl) : 'default'}-auth-token`;

type SupabaseClientType = ReturnType<typeof createClient<Database>>;

function createMockSupabaseClient(): SupabaseClientType {
  console.warn('[AI Studio] Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) not set — running with offline mock client');

  const createQueryBuilder = (isWrite = false) => {
    let singleRow = false;
    const resolveResult = () => ({
      data: singleRow ? null : isWrite ? null : [],
      error: isWrite
        ? { message: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.' }
        : null,
      count: 0,
      status: isWrite ? 503 : 200,
      statusText: isWrite ? 'Service Unavailable' : 'OK',
    });

    const builder: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            const p = Promise.resolve(resolveResult());
            return p.then.bind(p);
          }
          if (prop === 'catch') {
            const p = Promise.resolve(resolveResult());
            return p.catch.bind(p);
          }
          if (prop === 'finally') {
            const p = Promise.resolve(resolveResult());
            return p.finally.bind(p);
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return () => {
              singleRow = true;
              return builder;
            };
          }
          if (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') {
            return () => {
              isWrite = true;
              return builder;
            };
          }
          return () => builder;
        },
      }
    );

    return builder;
  };

  interface MockChannel {
    on: () => MockChannel;
    subscribe: () => MockChannel;
    unsubscribe: () => Promise<string>;
    send: () => Promise<string>;
  }

  const mockChannel = (): MockChannel => {
    const ch: MockChannel = {
      on: () => ch,
      subscribe: () => ch,
      unsubscribe: async () => 'ok',
      send: async () => 'ok',
    };
    return ch;
  };

  const mockClient = {
    from: () => createQueryBuilder(false),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => mockChannel(),
    removeChannel: async () => 'ok',
    removeAllChannels: async () => [],
    getChannels: () => [],
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            id: 'mock-subscription',
            callback: () => {},
            unsubscribe: () => {},
          },
        },
      }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.'),
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.'),
      }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({
        data: { user: null },
        error: new Error('Supabase is not configured.'),
      }),
    },
    storage: {
      from: () => ({
        upload: async () => ({
          data: null,
          error: new Error('Supabase storage is not configured.'),
        }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: path } }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };

  return mockClient as unknown as SupabaseClientType;
}

export const supabase: SupabaseClientType =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          storageKey: supabaseAuthStorageKey,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : createMockSupabaseClient();
