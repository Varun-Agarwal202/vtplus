import type { Units } from '@/db/settings';
import type { Session } from '@/db/types';
import type { Sample } from '@/dsp/types';
import { G, UNIT_LABEL, fromG } from '@/lib/units';

/**
 * Raw samples in the Phyphox "Accelerometer" export layout:
 *   "Time (s)","Acceleration x (m/s^2)","Acceleration y (m/s^2)","Acceleration z (m/s^2)"
 * so the file can be fed straight into reference/tremor_analyze.py.
 *
 * Samples are stored in g; by default they are converted to m/s² to match
 * Phyphox. Pass units='g' to keep g (the header reflects the unit).
 */
export function rawSamplesCsv(samples: Sample[], units: Units = 'ms2'): string {
  const unit = units === 'g' ? 'g' : 'm/s^2';
  const k = units === 'g' ? 1 : G;
  const lines: string[] = [
    `"Time (s)","Acceleration x (${unit})","Acceleration y (${unit})","Acceleration z (${unit})"`,
  ];
  const t0 = samples.length ? samples[0].t : 0;
  for (const s of samples) {
    lines.push(`${(s.t - t0).toFixed(6)},${(s.x * k).toFixed(6)},${(s.y * k).toFixed(6)},${(s.z * k).toFixed(6)}`);
  }
  return lines.join('\n') + '\n';
}

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** All session metrics + tags, one row per session. */
export function sessionsCsv(sessions: Session[], units: Units): string {
  const u = UNIT_LABEL[units];
  const header = [
    'id',
    'started_at',
    'position',
    'duration_s',
    'dominant_hz',
    'dominant_hz_interp',
    `rms_${units}`,
    `band_power_${units}2`,
    'peak_ratio',
    'spectral_entropy',
    `lf_motion_rms_${units}`,
    'measured_fs_hz',
    'jitter',
    'quality_flags',
    'analysis_mode',
    'sleep',
    'stress',
    'caffeine',
    'meds_taken',
    'meds_time',
    'notes',
    'device_model',
    'app_version',
  ];
  const rows = sessions.map((s) =>
    [
      s.id,
      s.startedAt,
      s.position,
      s.durationS.toFixed(2),
      s.dominantHz.toFixed(3),
      s.dominantHzInterp.toFixed(3),
      fromG(s.rmsG, units).toFixed(6),
      (units === 'g' ? s.bandPower : s.bandPower * G * G).toExponential(4),
      s.peakRatio.toFixed(4),
      s.spectralEntropy.toFixed(4),
      fromG(s.lfMotionRmsG, units).toFixed(6),
      s.measuredFsHz.toFixed(1),
      s.jitter.toFixed(4),
      s.qualityFlags.join('|'),
      s.analysisMode,
      s.sleep,
      s.stress,
      s.caffeine,
      s.medsTaken,
      s.medsTime,
      s.notes,
      s.deviceModel,
      s.appVersion,
    ]
      .map(csvEscape)
      .join(','),
  );
  return [`# amplitude unit: ${u}`, header.join(','), ...rows].join('\n') + '\n';
}
