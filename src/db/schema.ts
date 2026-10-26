import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'tremor-tracker.db';
export const SCHEMA_VERSION = 2;

/**
 * Forward-only migrations keyed by the version they upgrade *to*.
 * Add a new entry (and bump SCHEMA_VERSION) for every schema change; never
 * edit an existing one once it has shipped.
 */
const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      duration_s REAL NOT NULL,
      position TEXT NOT NULL CHECK (position IN ('rest','postural','kinetic')),
      measured_fs_hz REAL NOT NULL,
      jitter REAL NOT NULL,
      dominant_hz REAL NOT NULL,
      dominant_hz_interp REAL NOT NULL,
      band_power REAL NOT NULL,
      rms_g REAL NOT NULL,
      peak_ratio REAL NOT NULL,
      spectral_entropy REAL NOT NULL,
      lf_motion_rms_g REAL NOT NULL DEFAULT 0,
      quality_flags TEXT NOT NULL DEFAULT '[]',
      analysis_mode TEXT NOT NULL DEFAULT 'axes',
      sleep TEXT,
      stress INTEGER,
      caffeine INTEGER,
      meds_taken INTEGER,
      meds_time TEXT,
      notes TEXT,
      device_model TEXT,
      app_version TEXT,
      raw_path TEXT,
      spectrum_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_position ON sessions (position, started_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `,
  2: `
    ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE sessions ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced';
    ALTER TABLE sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_sync ON sessions (user_id, sync_status);

    CREATE TABLE IF NOT EXISTS user_settings_cache (
      user_id TEXT PRIMARY KEY NOT NULL,
      settings_json TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `,
};

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;
  while (current < SCHEMA_VERSION) {
    const next = current + 1;
    const sql = MIGRATIONS[next];
    if (!sql) throw new Error(`Missing migration to schema version ${next}`);
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${next}`);
    });
    current = next;
  }
}
