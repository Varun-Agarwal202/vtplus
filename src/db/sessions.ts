import type { SQLiteDatabase } from 'expo-sqlite';

import type { AnalysisMode, QualityFlag } from '@/dsp/types';
import type { NewSession, Position, Session, SessionTags, Sleep } from './types';

export type SyncStatus = 'synced' | 'pending_insert' | 'pending_update' | 'pending_delete';

interface Row {
  id: string;
  user_id: string;
  started_at: string;
  duration_s: number;
  position: Position;
  measured_fs_hz: number;
  jitter: number;
  dominant_hz: number;
  dominant_hz_interp: number;
  band_power: number;
  rms_g: number;
  peak_ratio: number;
  spectral_entropy: number;
  lf_motion_rms_g: number;
  quality_flags: string;
  analysis_mode: AnalysisMode;
  sleep: Sleep | null;
  stress: number | null;
  caffeine: number | null;
  meds_taken: number | null;
  meds_time: string | null;
  notes: string | null;
  device_model: string | null;
  app_version: string | null;
  raw_path: string | null;
  spectrum_json: string | null;
  sync_status: SyncStatus;
  updated_at: string;
}

export interface CachedSession {
  session: Session;
  syncStatus: SyncStatus;
  updatedAt: string;
}

function fromRow(r: Row): Session {
  let flags: QualityFlag[] = [];
  try {
    flags = JSON.parse(r.quality_flags) as QualityFlag[];
  } catch {
    flags = [];
  }
  return {
    id: r.id,
    startedAt: r.started_at,
    durationS: r.duration_s,
    position: r.position,
    measuredFsHz: r.measured_fs_hz,
    jitter: r.jitter,
    dominantHz: r.dominant_hz,
    dominantHzInterp: r.dominant_hz_interp,
    bandPower: r.band_power,
    rmsG: r.rms_g,
    peakRatio: r.peak_ratio,
    spectralEntropy: r.spectral_entropy,
    lfMotionRmsG: r.lf_motion_rms_g,
    qualityFlags: flags,
    analysisMode: r.analysis_mode,
    sleep: r.sleep,
    stress: r.stress,
    caffeine: r.caffeine === null ? null : r.caffeine === 1,
    medsTaken: r.meds_taken === null ? null : r.meds_taken === 1,
    medsTime: r.meds_time,
    notes: r.notes,
    deviceModel: r.device_model,
    appVersion: r.app_version,
    rawPath: r.raw_path,
    spectrumJson: r.spectrum_json,
  };
}

function cached(r: Row): CachedSession {
  return { session: fromRow(r), syncStatus: r.sync_status, updatedAt: r.updated_at };
}

const bool = (v: boolean | null) => (v === null ? null : v ? 1 : 0);

export function newSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

const UPSERT_SQL = `INSERT OR REPLACE INTO sessions (
  id, user_id, started_at, duration_s, position, measured_fs_hz, jitter,
  dominant_hz, dominant_hz_interp, band_power, rms_g, peak_ratio, spectral_entropy,
  lf_motion_rms_g, quality_flags, analysis_mode,
  sleep, stress, caffeine, meds_taken, meds_time, notes,
  device_model, app_version, raw_path, spectrum_json, sync_status, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function upsertArgs(userId: string, s: Session, syncStatus: SyncStatus, updatedAt: string): (string | number | null)[] {
  return [
    s.id,
    userId,
    s.startedAt,
    s.durationS,
    s.position,
    s.measuredFsHz,
    s.jitter,
    s.dominantHz,
    s.dominantHzInterp,
    s.bandPower,
    s.rmsG,
    s.peakRatio,
    s.spectralEntropy,
    s.lfMotionRmsG,
    JSON.stringify(s.qualityFlags),
    s.analysisMode,
    s.sleep,
    s.stress,
    bool(s.caffeine),
    bool(s.medsTaken),
    s.medsTime,
    s.notes,
    s.deviceModel,
    s.appVersion,
    s.rawPath,
    s.spectrumJson,
    syncStatus,
    updatedAt,
  ];
}

export async function upsertSession(
  db: SQLiteDatabase,
  userId: string,
  s: Session,
  syncStatus: SyncStatus,
  updatedAt = new Date().toISOString(),
): Promise<void> {
  await db.runAsync(UPSERT_SQL, upsertArgs(userId, s, syncStatus, updatedAt));
}

export async function insertSession(db: SQLiteDatabase, userId: string, s: NewSession, id = newSessionId()): Promise<Session> {
  const session: Session = { ...s, id };
  await upsertSession(db, userId, session, 'pending_insert');
  return session;
}

export async function updateSessionTags(db: SQLiteDatabase, userId: string, id: string, tags: SessionTags): Promise<void> {
  const row = await getCachedSession(db, userId, id, true);
  if (!row) return;
  const nextStatus: SyncStatus = row.syncStatus === 'pending_insert' ? 'pending_insert' : 'pending_update';
  await db.runAsync(
    `UPDATE sessions SET sleep = ?, stress = ?, caffeine = ?, meds_taken = ?, meds_time = ?, notes = ?, sync_status = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [tags.sleep, tags.stress, bool(tags.caffeine), bool(tags.medsTaken), tags.medsTime, tags.notes, nextStatus, new Date().toISOString(), id, userId],
  );
}

export async function setSessionRawPath(db: SQLiteDatabase, userId: string, id: string, rawPath: string | null): Promise<void> {
  const row = await getCachedSession(db, userId, id, true);
  if (!row) return;
  const nextStatus: SyncStatus = row.syncStatus === 'pending_insert' ? 'pending_insert' : row.syncStatus === 'pending_delete' ? 'pending_delete' : 'pending_update';
  await db.runAsync('UPDATE sessions SET raw_path = ?, sync_status = ?, updated_at = ? WHERE id = ? AND user_id = ?', [
    rawPath,
    nextStatus,
    new Date().toISOString(),
    id,
    userId,
  ]);
}

export async function markSynced(db: SQLiteDatabase, userId: string, id: string): Promise<void> {
  await db.runAsync(`UPDATE sessions SET sync_status = 'synced', updated_at = ? WHERE id = ? AND user_id = ?`, [new Date().toISOString(), id, userId]);
}

export async function markPendingDelete(db: SQLiteDatabase, userId: string, id: string): Promise<void> {
  await db.runAsync(`UPDATE sessions SET sync_status = 'pending_delete', updated_at = ? WHERE id = ? AND user_id = ?`, [new Date().toISOString(), id, userId]);
}

export interface SessionFilter {
  position?: Position | 'all';
  /** ISO string lower bound (inclusive) */
  since?: string;
  /** ISO string upper bound (exclusive) */
  until?: string;
  analysisMode?: AnalysisMode | 'all';
  limit?: number;
}

function visibleWhere(filter: SessionFilter, userId: string): { sql: string; args: (string | number)[] } {
  const where = [`user_id = ?`, `sync_status != 'pending_delete'`];
  const args: (string | number)[] = [userId];
  if (filter.position && filter.position !== 'all') {
    where.push('position = ?');
    args.push(filter.position);
  }
  if (filter.analysisMode && filter.analysisMode !== 'all') {
    where.push('analysis_mode = ?');
    args.push(filter.analysisMode);
  }
  if (filter.since) {
    where.push('started_at >= ?');
    args.push(filter.since);
  }
  if (filter.until) {
    where.push('started_at < ?');
    args.push(filter.until);
  }
  return { sql: where.join(' AND '), args };
}

export async function listSessions(db: SQLiteDatabase, userId: string, filter: SessionFilter = {}): Promise<Session[]> {
  const { sql, args } = visibleWhere(filter, userId);
  const limit = filter.limit ? ` LIMIT ${Math.max(1, Math.floor(filter.limit))}` : '';
  const rows = await db.getAllAsync<Row>(`SELECT * FROM sessions WHERE ${sql} ORDER BY started_at DESC${limit}`, args);
  return rows.map(fromRow);
}

export async function listCachedSessions(db: SQLiteDatabase, userId: string): Promise<CachedSession[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM sessions WHERE user_id = ?', [userId]);
  return rows.map(cached);
}

export async function listPendingSessions(db: SQLiteDatabase, userId: string): Promise<CachedSession[]> {
  const rows = await db.getAllAsync<Row>(`SELECT * FROM sessions WHERE user_id = ? AND sync_status != 'synced'`, [userId]);
  return rows.map(cached);
}

export async function getSession(db: SQLiteDatabase, userId: string, id: string): Promise<Session | null> {
  const row = await getCachedSession(db, userId, id, false);
  return row?.session ?? null;
}

export async function getCachedSession(
  db: SQLiteDatabase,
  userId: string,
  id: string,
  includeDeleted: boolean,
): Promise<CachedSession | null> {
  const row = await db.getFirstAsync<Row>(
    includeDeleted
      ? 'SELECT * FROM sessions WHERE id = ? AND user_id = ?'
      : `SELECT * FROM sessions WHERE id = ? AND user_id = ? AND sync_status != 'pending_delete'`,
    [id, userId],
  );
  return row ? cached(row) : null;
}

export async function deleteSession(db: SQLiteDatabase, userId: string, id: string): Promise<void> {
  await db.runAsync('DELETE FROM sessions WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function deleteAllSessions(db: SQLiteDatabase, userId: string): Promise<void> {
  await db.runAsync('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

export async function countPending(db: SQLiteDatabase, userId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND sync_status != 'synced'`,
    [userId],
  );
  return row?.n ?? 0;
}
