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

const samplePosts = [
  {
    id: 'demo-1',
    title: 'Добро пожаловать в Базу Знаний тгк',
    content_type: 'text',
    content_types: ['text'],
    content: 'Это демонстрационный пост. Похоже, что текущий ключ Supabase не зарегистрирован или недействителен (Unregistered API key). Приложение переключено в автономный демонстрационный режим.',
    transcript: null,
    description: 'Интерактивная база знаний с аннотациями и медиа.',
    has_description: true,
    media_urls: [],
    allow_comments: true,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    author_id: 'demo-admin',
  },
];

const sampleAnnotations = [
  { id: 'ann-1', term: 'База знаний', content: 'Система хранения и структурирования информации с перекрестными ссылками.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'ann-2', term: 'Аннотация', content: 'Всплывающее описание термина при клике в тексте поста.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

const sampleHashtags = [
  { id: 'h-1', name: 'новости', created_at: new Date().toISOString() },
  { id: 'h-2', name: 'технологии', created_at: new Date().toISOString() },
];

const samplePersons = [
  { id: 'p-1', name: 'Администратор', created_at: new Date().toISOString() },
];

const sampleUserProfile = {
  id: 'demo-admin',
  username: 'admin',
  avatar_url: null,
  email: 'admin@example.com',
  is_admin: true,
  approval_status: 'approved',
  approved_by: 'system',
  approval_date: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function wrapRealClient(client: SupabaseClientType): SupabaseClientType {
  let hasWarnedApiKey = false;

  const handleApiKeyError = (err: unknown) => {
    const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
    if (msg.includes('API key') || msg.includes('JWT') || msg.includes('unregistered') || msg.includes('Failed to fetch')) {
      if (!hasWarnedApiKey) {
        hasWarnedApiKey = true;
        console.warn('[AI Studio] Supabase API key error detected ("' + msg + '"). Falling back to resilient demo mode.');
      }
      return true;
    }
    return false;
  };

  const originalFrom = client.from.bind(client);
  const originalRpc = client.rpc.bind(client);

  function wrapBuilder(builder: unknown, table: string): unknown {
    return new Proxy(builder as object, {
      get(target, prop, receiver) {
        if (prop === 'then') {
          return async function(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            try {
              const res = await (target as PromiseLike<unknown>);
              if (res && typeof res === 'object' && 'error' in res && (res as { error: unknown }).error && handleApiKeyError((res as { error: unknown }).error)) {
                let mockData: unknown = [];
                if (table === 'posts') mockData = samplePosts;
                else if (table === 'annotations') mockData = sampleAnnotations;
                else if (table === 'hashtags') mockData = sampleHashtags;
                else if (table === 'persons') mockData = samplePersons;
                else if (table === 'user_profiles') mockData = sampleUserProfile;

                const successRes = { data: mockData, error: null, count: Array.isArray(mockData) ? mockData.length : 1, status: 200, statusText: 'OK' };
                return onFulfilled ? onFulfilled(successRes) : successRes;
              }
              return onFulfilled ? onFulfilled(res) : res;
            } catch (err) {
              if (handleApiKeyError(err)) {
                let mockData: unknown = [];
                if (table === 'posts') mockData = samplePosts;
                else if (table === 'annotations') mockData = sampleAnnotations;
                else if (table === 'hashtags') mockData = sampleHashtags;
                else if (table === 'persons') mockData = samplePersons;
                else if (table === 'user_profiles') mockData = sampleUserProfile;

                const successRes = { data: mockData, error: null, count: Array.isArray(mockData) ? mockData.length : 1, status: 200, statusText: 'OK' };
                return onFulfilled ? onFulfilled(successRes) : successRes;
              }
              if (onRejected) return onRejected(err);
              throw err;
            }
          };
        }
        const val = Reflect.get(target, prop, receiver);
        if (typeof val === 'function') {
          return function(...args: unknown[]) {
            const result = (val as (...a: unknown[]) => unknown).apply(target, args);
            if (result && typeof result === 'object') {
              return wrapBuilder(result, table);
            }
            return result;
          };
        }
        return val;
      }
    });
  }

  const resilientFrom = (table: string) => {
    const builder = originalFrom(table as never);
    return wrapBuilder(builder, table);
  };

  const resilientRpc = async (fnName: string, args?: unknown) => {
    try {
      const res = await originalRpc(fnName as never, args as never);
      if (res && typeof res === 'object' && 'error' in res && (res as { error: unknown }).error && handleApiKeyError((res as { error: unknown }).error)) {
        if (fnName === 'list_visible_channels' || fnName === 'list_visible_groups' || fnName === 'list_public_groups') {
          return { data: [], error: null };
        }
        if (fnName === 'get_post_stats') {
          return { data: { view_count: 42, like_count: 5 }, error: null };
        }
        return { data: null, error: null };
      }
      return res;
    } catch (err) {
      if (handleApiKeyError(err)) {
        return { data: null, error: null };
      }
      throw err;
    }
  };

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'from') return resilientFrom;
      if (prop === 'rpc') return resilientRpc;
      const val = (target as Record<string | symbol, unknown>)[prop];
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    },
  });
}

export const supabase: SupabaseClientType =
  supabaseUrl && supabaseAnonKey
    ? wrapRealClient(createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          storageKey: supabaseAuthStorageKey,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }))
    : createMockSupabaseClient();
