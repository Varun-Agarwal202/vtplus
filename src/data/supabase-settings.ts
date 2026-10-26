import type { SupabaseClient } from '@supabase/supabase-js';

import { parseSettingsObject, type Settings } from '@/db/settings';

export async function loadSettings(client: SupabaseClient, userId: string): Promise<Settings> {
  const { data, error } = await client.from('user_settings').select('settings').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.settings) return parseSettingsObject(null);
  return parseSettingsObject(data.settings);
}

export async function saveSettings(client: SupabaseClient, userId: string, settings: Settings): Promise<void> {
  const { error } = await client.from('user_settings').upsert(
    { user_id: userId, settings, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
}

export async function clearSettings(client: SupabaseClient, userId: string): Promise<void> {
  const { error } = await client.from('user_settings').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}
