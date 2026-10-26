import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export function oauthRedirectUri(): string {
  return makeRedirectUri({ scheme: 'tremortracker', path: 'auth/callback' });
}

function param(url: string, key: string): string | null {
  const match = new RegExp(`[?#&]${key}=([^&#]+)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

async function sessionFromUrl(url: string): Promise<{ error: string | null }> {
  const oauthError = param(url, 'error_description') ?? param(url, 'error');
  if (oauthError) return { error: oauthError.replace(/\+/g, ' ') };

  const code = param(url, 'code');
  if (code) {
    const { error } = await getSupabase().auth.exchangeCodeForSession(code);
    return { error: error?.message ?? null };
  }

  const access_token = param(url, 'access_token');
  const refresh_token = param(url, 'refresh_token');
  if (access_token && refresh_token) {
    const { error } = await getSupabase().auth.setSession({ access_token, refresh_token });
    return { error: error?.message ?? null };
  }

  return { error: 'Google sign-in did not return a session.' };
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo = oauthRedirectUri();
  const { data, error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return { error: error.message };
  if (!data.url) return { error: 'Could not start Google sign-in.' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') return { error: null };
  if (result.type !== 'success') return { error: 'Google sign-in was interrupted.' };
  return sessionFromUrl(result.url);
}
