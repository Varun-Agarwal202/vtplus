import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { readMfaStatus, type MfaStep } from '@/lib/mfa';
import { signInWithGoogle as oauthGoogle } from '@/lib/oauth';
import { getSupabase, supabaseConfigured } from '@/lib/supabase';

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  /**
   * Where the signed-in person is in two-step sign-in: `'verify'` needs a
   * code, `'ok'` may use the app. `null` while being worked out.
   */
  mfa: MfaStep | null;
  /** A verified authenticator is enrolled — shown in Settings. */
  mfaEnabled: boolean;
  /** Re-reads the two-step state, e.g. after a code is accepted. */
  refreshMfa: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirm: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [mfa, setMfa] = useState<MfaStep | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  const applyMfa = useCallback(async () => {
    if (!supabaseConfigured) return;
    const next = await readMfaStatus();
    setMfa(next.step);
    setMfaEnabled(next.enabled);
  }, []);

  const refreshMfa = useCallback(async () => {
    await applyMfa();
  }, [applyMfa]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const client = getSupabase();
    let alive = true;
    client.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      if (!next) {
        setMfa(null);
        setMfaEnabled(false);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const accessToken = session?.access_token ?? null;
  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    readMfaStatus().then((next) => {
      if (!alive) return;
      setMfa(next.step);
      setMfaEnabled(next.enabled);
    });
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabaseConfigured) return { error: 'Supabase is not configured on this build.' };
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabaseConfigured) return { error: 'Supabase is not configured on this build.', needsEmailConfirm: false };
    const { data, error } = await getSupabase().auth.signUp({ email: email.trim(), password });
    const needsEmailConfirm = !error && !data.session;
    return { error: error?.message ?? null, needsEmailConfirm };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) return { error: 'Supabase is not configured on this build.' };
    return oauthGoogle();
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured) return;
    await getSupabase().auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      configured: supabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      mfa,
      mfaEnabled,
      refreshMfa,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [loading, session, mfa, mfaEnabled, refreshMfa, signIn, signUp, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
