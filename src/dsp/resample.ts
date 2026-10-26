import type { Sample } from './types';

export interface Channels {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
}

export interface TimingStats {
  /** (n - 1) / (t_last - t_first) */
  measuredFsHz: number;
  /** std(dt) / mean(dt) */
  jitter: number;
  durationS: number;
}

export function timingStats(t: ArrayLike<number>): TimingStats {
  const n = t.length;
  if (n < 2) return { measuredFsHz: 0, jitter: 0, durationS: 0 };
  const span = t[n - 1] - t[0];
  let sum = 0;
  for (let i = 1; i < n; i++) sum += t[i] - t[i - 1];
  const mean = sum / (n - 1);
  let varAcc = 0;
  for (let i = 1; i < n; i++) {
    const d = t[i] - t[i - 1] - mean;
    varAcc += d * d;
  }
  // population std, like numpy.std
  const std = Math.sqrt(varAcc / (n - 1));
  return {
    measuredFsHz: span > 0 ? (n - 1) / span : 0,
    jitter: mean > 0 ? std / mean : 0,
    durationS: span,
  };
}

/**
 * Linear interpolation of (xp, fp) at points xq, equivalent to numpy.interp
 * (clamps outside the range). xp must be increasing.
 */
export function interp(xq: ArrayLike<number>, xp: ArrayLike<number>, fp: ArrayLike<number>): Float64Array {
  const out = new Float64Array(xq.length);
  const n = xp.length;
  let j = 0;
  for (let i = 0; i < xq.length; i++) {
    const q = xq[i];
    if (q <= xp[0]) {
      out[i] = fp[0];
      continue;
    }
    if (q >= xp[n - 1]) {
      out[i] = fp[n - 1];
      continue;
    }
    while (j < n - 2 && xp[j + 1] < q) j++;
    // guard for non-monotonic query points
    while (j > 0 && xp[j] > q) j--;
    const x0 = xp[j];
    const x1 = xp[j + 1];
    const w = x1 > x0 ? (q - x0) / (x1 - x0) : 0;
    out[i] = fp[j] + w * (fp[j + 1] - fp[j]);
  }
  return out;
}

/**
 * Resample irregular samples onto a uniform grid t = 0, 1/fs, 2/fs, ... < duration,
 * exactly like `numpy.arange(0, t[-1], 1/fs)` followed by `numpy.interp`.
 * Time is re-based so the first sample is at t = 0. Non-monotonic timestamps
 * (which can happen when two sensor events share a tick) are nudged forward.
 */
export function resampleUniform(samples: Sample[], fs: number): { t: Float64Array; ch: Channels } {
  const n = samples.length;
  if (n < 2) throw new Error('resampleUniform: need at least two samples');
  const t0 = samples[0].t;
  const t = new Float64Array(n);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    let ti = s.t - t0;
    if (i > 0 && ti <= t[i - 1]) ti = t[i - 1] + 1e-6;
    t[i] = ti;
    x[i] = s.x;
    y[i] = s.y;
    z[i] = s.z;
  }
  const tEnd = t[n - 1];
  const dt = 1 / fs;
  // numpy.arange(0, tEnd, dt) -> ceil(tEnd / dt) points
  const m = Math.max(0, Math.ceil(tEnd / dt));
  const tu = new Float64Array(m);
  for (let i = 0; i < m; i++) tu[i] = i * dt;
  return {
    t: tu,
    ch: { x: interp(tu, t, x), y: interp(tu, t, y), z: interp(tu, t, z) },
  };
}
