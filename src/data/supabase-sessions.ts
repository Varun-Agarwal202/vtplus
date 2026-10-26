import type { SupabaseClient } from '@supabase/supabase-js';

import type { SessionFilter } from '@/db/sessions';
import type { NewSession, Session, SessionTags } from '@/db/types';
import type { QualityFlag } from '@/dsp/types';

export type { SessionFilter };

interface SessionRow {
  id: string;
  user_id: string;
  started_at: string;
  duration_s: number;
  position: Session['position'];
  measured_fs_hz: number;
  jitter: number;
  dominant_hz: number;
  dominant_hz_interp: number;
  band_power: number;
  rms_g: number;
  peak_ratio: number;
  spectral_entropy: number;
  lf_motion_rms_g: number;
  quality_flags: QualityFlag[] | string;
  analysis_mode: Session['analysisMode'];
  sleep: Session['sleep'];
  stress: number | null;
  caffeine: boolean | null;
  meds_taken: boolean | null;
  meds_time: string | null;
  notes: string | null;
  device_model: string | null;
  app_version: string | null;
  raw_path: string | null;
  spectrum_json: string | null;
}

function parseFlags(raw: SessionRow['quality_flags']): QualityFlag[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as QualityFlag[];
    } catch {
      return [];
    }
  }
  return [];
}

export function sessionFromCloudRow(r: SessionRow): Session {
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
    qualityFlags: parseFlags(r.quality_flags),
    analysisMode: r.analysis_mode,
    sleep: r.sleep,
    stress: r.stress,
    caffeine: r.caffeine,
    medsTaken: r.meds_taken,
    medsTime: r.meds_time,
    notes: r.notes,
    deviceModel: r.device_model,
    appVersion: r.app_version,
    rawPath: r.raw_path,
    spectrumJson: r.spectrum_json,
  };
}

function toCloudRow(userId: string, s: NewSession & { id: string }): Record<string, unknown> {
  return {
    id: s.id,
    user_id: userId,
    started_at: s.startedAt,
    duration_s: s.durationS,
    position: s.position,
    measured_fs_hz: s.measuredFsHz,
    jitter: s.jitter,
    dominant_hz: s.dominantHz,
    dominant_hz_interp: s.dominantHzInterp,
    band_power: s.bandPower,
    rms_g: s.rmsG,
    peak_ratio: s.peakRatio,
    spectral_entropy: s.spectralEntropy,
    lf_motion_rms_g: s.lfMotionRmsG,
    quality_flags: s.qualityFlags,
    analysis_mode: s.analysisMode,
    sleep: s.sleep,
    stress: s.stress,
    caffeine: s.caffeine,
    meds_taken: s.medsTaken,
    meds_time: s.medsTime,
    notes: s.notes,
    device_model: s.deviceModel,
    app_version: s.appVersion,
    raw_path: s.rawPath,
    spectrum_json: s.spectrumJson,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertSession(client: SupabaseClient, userId: string, s: Session): Promise<void> {
  const { error } = await client.from('sessions').upsert(toCloudRow(userId, s), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function updateSessionTags(client: SupabaseClient, userId: string, id: string, tags: SessionTags): Promise<void> {
  const { error } = await client
    .from('sessions')
    .update({
      sleep: tags.sleep,
      stress: tags.stress,
      caffeine: tags.caffeine,
      meds_taken: tags.medsTaken,
      meds_time: tags.medsTime,
      notes: tags.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function setSessionRawPath(client: SupabaseClient, userId: string, id: string, rawPath: string | null): Promise<void> {
  const { error } = await client
    .from('sessions')
    .update({ raw_path: rawPath, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listAllSessions(client: SupabaseClient, userId: string): Promise<Session[]> {
  const { data, error } = await client.from('sessions').select('*').eq('user_id', userId).order('started_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SessionRow[]).map(sessionFromCloudRow);
}

export async function deleteSession(client: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await client.from('sessions').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function deleteAllSessions(client: SupabaseClient, userId: string): Promise<void> {
  const { error } = await client.from('sessions').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}
