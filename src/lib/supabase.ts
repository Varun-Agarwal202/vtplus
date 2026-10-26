import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The client appends its own paths, so keep only the origin (people often paste the …/rest/v1/ URL).
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '').replace(/^(https?:\/\/[^/]+).*$/, '$1');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export const supabaseConfigured = Boolean(url && anonKey);

const storage =
  Platform.OS === 'web'
    ? undefined
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        // Web returns from Google with a PKCE code at the Netlify site root.
        // Native completes its separate browser session in `lib/oauth.ts`.
        detectSessionInUrl: Platform.OS === 'web',
        // backup codes for two-step sign-in; harmless if the server has them off
        experimental: { recoveryCodes: true },
      },
    });
  }
  return client;
}
