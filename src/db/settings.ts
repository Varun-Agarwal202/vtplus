import type { SQLiteDatabase } from 'expo-sqlite';

import type { AnalysisMode } from '@/dsp/types';
import { EMPTY_PROFILE, parseProfile, type Profile } from '@/lib/profile';
import type { Position } from './types';

export type Units = 'g' | 'ms2';

export interface Settings {
  units: Units;
  devMode: boolean;
  analysisMode: AnalysisMode;
  disclaimerAccepted: boolean;
  /** recording length in seconds */
  durationS: number;
  defaultPosition: Position;
  /** show the research dose model on results */
  showDoseModel: boolean;
  /** the user has read the model's framing once */
  modelAcknowledged: boolean;
  profile: Profile;
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'g',
  devMode: false,
  analysisMode: 'axes',
  disclaimerAccepted: false,
  durationS: 30,
  defaultPosition: 'rest',
  showDoseModel: true,
  modelAcknowledged: false,
  profile: EMPTY_PROFILE,
};

export const DURATION_OPTIONS = [30, 45, 60];

export function parseSettingsObject(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const v = raw as Partial<Settings>;
  if (v.units === 'g' || v.units === 'ms2') out.units = v.units;
  if (typeof v.devMode === 'boolean') out.devMode = v.devMode;
  if (v.analysisMode === 'axes' || v.analysisMode === 'magnitude') out.analysisMode = v.analysisMode;
  if (typeof v.disclaimerAccepted === 'boolean') out.disclaimerAccepted = v.disclaimerAccepted;
  if (typeof v.durationS === 'number' && v.durationS >= 25 && v.durationS <= 120) out.durationS = v.durationS;
  if (v.defaultPosition === 'rest' || v.defaultPosition === 'postural' || v.defaultPosition === 'kinetic') {
    out.defaultPosition = v.defaultPosition;
  }
  if (typeof v.showDoseModel === 'boolean') out.showDoseModel = v.showDoseModel;
  if (typeof v.modelAcknowledged === 'boolean') out.modelAcknowledged = v.modelAcknowledged;
  out.profile = parseProfile(v.profile);
  return out;
}

export async function loadSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const bag: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      bag[r.key] = JSON.parse(r.value) as unknown;
    } catch {
      // ignore malformed values; defaults apply
    }
  }
  return parseSettingsObject(bag);
}

export interface CachedUserSettings {
  settings: Settings;
  dirty: boolean;
  updatedAt: string;
}

export async function loadCachedUserSettings(db: SQLiteDatabase, userId: string): Promise<CachedUserSettings | null> {
  const row = await db.getFirstAsync<{ settings_json: string; dirty: number; updated_at: string }>(
    'SELECT settings_json, dirty, updated_at FROM user_settings_cache WHERE user_id = ?',
    [userId],
  );
  if (!row) return null;
  try {
    return { settings: parseSettingsObject(JSON.parse(row.settings_json)), dirty: row.dirty === 1, updatedAt: row.updated_at };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, dirty: row.dirty === 1, updatedAt: row.updated_at };
  }
}

export async function saveCachedUserSettings(
  db: SQLiteDatabase,
  userId: string,
  settings: Settings,
  dirty: boolean,
  updatedAt = new Date().toISOString(),
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO user_settings_cache (user_id, settings_json, dirty, updated_at) VALUES (?, ?, ?, ?)`,
    [userId, JSON.stringify(settings), dirty ? 1 : 0, updatedAt],
  );
}

export async function clearCachedUserSettings(db: SQLiteDatabase, userId: string): Promise<void> {
  await db.runAsync('DELETE FROM user_settings_cache WHERE user_id = ?', [userId]);
}

export async function saveSetting<K extends keyof Settings>(db: SQLiteDatabase, key: K, value: Settings[K]): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
}

export async function clearSettings(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('DELETE FROM settings');
}
