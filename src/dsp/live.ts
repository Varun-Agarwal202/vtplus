/**
 * Lightweight live estimate for the recording screen: takes the last ~2 s of
 * samples, resamples to a uniform grid, removes the mean, applies a Hann
 * window, zero-pads to a power of two and reports the dominant frequency in
 * the tremor band. This is only a visual hint; the session result comes from
 * `analyze()`.
 */
import { nextPowerOfTwo, rfft, rfftfreq } from './fft';
import { interp } from './resample';
import type { Sample } from './types';
import { hannPeriodic } from './welch';

export interface LiveEstimate {
  dominantHz: number | null;
  /** RMS of the mean-removed magnitude over the window (input units) */
  rms: number;
  measuredFsHz: number;
}

export function liveEstimate(
  recent: Sample[],
  opts: { fs?: number; band?: [number, number]; minSeconds?: number } = {},
): LiveEstimate {
  const fs = opts.fs ?? 100;
  const band = opts.band ?? [4, 12];
  const minSeconds = opts.minSeconds ?? 1.5;
  const n = recent.length;
  if (n < 8) return { dominantHz: null, rms: 0, measuredFsHz: 0 };

  const t0 = recent[0].t;
  const span = recent[n - 1].t - t0;
  const measuredFsHz = span > 0 ? (n - 1) / span : 0;
  if (span < minSeconds) return { dominantHz: null, rms: 0, measuredFsHz };

  const tp = new Float64Array(n);
  const mag = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = recent[i];
    tp[i] = s.t - t0;
    if (i > 0 && tp[i] <= tp[i - 1]) tp[i] = tp[i - 1] + 1e-6;
    mag[i] = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
  }
  const m = Math.floor(span * fs);
  const tu = new Float64Array(m);
  for (let i = 0; i < m; i++) tu[i] = i / fs;
  const u = interp(tu, tp, mag);

  let mean = 0;
  for (let i = 0; i < m; i++) mean += u[i];
  mean /= m;
  let sq = 0;
  const win = hannPeriodic(m);
  const seg = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const v = u[i] - mean;
    sq += v * v;
    seg[i] = v * win[i];
  }
  const rms = Math.sqrt(sq / m);

  const nfft = nextPowerOfTwo(m) * 2;
  const { re, im } = rfft(seg, nfft);
  const f = rfftfreq(nfft, fs);
  let best = -1;
  let bestP = -1;
  for (let k = 0; k < f.length; k++) {
    if (f[k] < band[0] || f[k] > band[1]) continue;
    const p = re[k] * re[k] + im[k] * im[k];
    if (p > bestP) {
      bestP = p;
      best = k;
    }
  }
  return { dominantHz: best >= 0 ? f[best] : null, rms, measuredFsHz };
}
