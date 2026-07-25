import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseAuthStorageKey } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_TIMEOUT_MS = 3000;

function readCachedSession(): Session | null {
  if (typeof window === 'undefined') return null;

  const rawSession = window.localStorage.getItem(supabaseAuthStorageKey);
  if (!rawSession) return null;

  try {
    const session = JSON.parse(rawSession) as Session | null;
    return session?.user ? session : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedSession = readCachedSession();
  const [user, setUser] = useState<User | null>(cachedSession?.user ?? null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(!cachedSession?.user);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    setProfile(data);
  }

  useEffect(() => {
    const cached = readCachedSession();

    if (cached?.user) {
      setUser(cached.user);
      setLoading(false);
      loadProfile(cached.user.id).catch((error) => {
        console.warn('Failed to load cached user profile:', error);
      });
    }

    withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS)
      .then((result) => {
        if (!result) {
          setLoading(false);
          return;
        }

        const session = result.data.session;
        setUser(session?.user ?? null);
        if (session?.user) {
          loadProfile(session.user.id).catch((error) => {
            console.warn('Failed to load user profile:', error);
          });
        } else {
          setProfile(null);
        }
      })
      .catch((error) => {
        console.warn('Failed to restore auth session:', error);
      })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })().catch((error) => {
        console.warn('Failed to handle auth state change:', error);
        setLoading(false);
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      setUser(data.user);
      await loadProfile(data.user.id);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
