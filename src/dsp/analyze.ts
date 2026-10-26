/**
 * Tremor analysis pipeline. Pure TypeScript port of `reference/tremor_analyze.py`:
 *
 *   resample to uniform fs -> trim ends -> 1 Hz high-pass (zero phase)
 *   -> Welch PSD summed over axes -> dominant freq / band power / peak ratio
 *   -> band-passed RMS -> spectral entropy -> quality checks
 *
 * Units are preserved: feed g, get RMS in g; feed m/s^2, get RMS in m/s^2.
 */
import { butter } from './butterworth';
import { resampleUniform, timingStats, type Channels } from './resample';
import { sosfiltfilt } from './sosfilt';
import type { AnalysisMode, AnalysisOptions, AnalysisResult, QualityIssue, Sample } from './types';
import { trapezoid, welch } from './welch';

export const DEFAULTS = {
  fs: 100,
  trimS: 2,
  band: [4, 12] as [number, number],
  welchSegmentS: 4,
  mode: 'axes' as AnalysisMode,
  /**
   * Heuristic, uncalibrated. RMS (0-1 Hz, before the high-pass) above this
   * means the phone was drifting/moving rather than held still. Expressed in
   * the input unit; 0.05 g ~ 0.5 m/s^2.
   */
  lfMotionRmsThreshold: 0.05,
};

export const QUALITY_LIMITS = {
  minFsHz: 50,
  minDurationS: 20,
  maxJitter: 0.5,
  minPeakRatio: 0.15,
};

/** Raw seconds needed so trimming both ends still leaves minDurationS. */
export const MIN_RAW_S = QUALITY_LIMITS.minDurationS + 2 * DEFAULTS.trimS;

/** Index range [lo, hi] (inclusive) of f values inside [fLo, fHi]. */
function bandIndices(f: Float64Array, fLo: number, fHi: number): [number, number] {
  let lo = -1;
  let hi = -1;
  for (let i = 0; i < f.length; i++) {
    if (f[i] >= fLo && f[i] <= fHi) {
      if (lo < 0) lo = i;
      hi = i;
    }
  }
  if (lo < 0) throw new Error(`no PSD bins in [${fLo}, ${fHi}] Hz`);
  return [lo, hi];
}

function argmax(a: ArrayLike<number>, lo: number, hi: number): number {
  let best = lo;
  for (let i = lo + 1; i <= hi; i++) if (a[i] > a[best]) best = i;
  return best;
}

/** Parabolic interpolation of a peak at index k (clamped to +/- half a bin). */
function refinePeak(f: Float64Array, p: Float64Array, k: number): number {
  if (k <= 0 || k >= p.length - 1) return f[k];
  const a = p[k - 1];
  const b = p[k];
  const c = p[k + 1];
  const denom = a - 2 * b + c;
  if (denom === 0) return f[k];
  let delta = (0.5 * (a - c)) / denom;
  delta = Math.max(-0.5, Math.min(0.5, delta));
  return f[k] + delta * (f[1] - f[0]);
}

function rmsOfChannels(chs: Float64Array[]): number {
  const n = chs[0].length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const ch of chs) s += ch[i] * ch[i];
    acc += s;
  }
  return Math.sqrt(acc / n);
}

function rmsTimeline(chs: Float64Array[], fs: number, windowS = 1): Float64Array {
  const n = chs[0].length;
  const w = Math.round(windowS * fs);
  const count = Math.floor(n / w);
  const out = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    let acc = 0;
    for (let i = k * w; i < (k + 1) * w; i++) {
      for (const ch of chs) acc += ch[i] * ch[i];
    }
    out[k] = Math.sqrt(acc / w);
  }
  return out;
}

function sumPsd(chs: Float64Array[], fs: number, nperseg: number) {
  let f: Float64Array | null = null;
  let psd: Float64Array | null = null;
  for (const ch of chs) {
    const r = welch(ch, fs, nperseg, Math.floor(nperseg / 2));
    if (!psd) {
      f = r.f;
      psd = Float64Array.from(r.psd);
    } else {
      for (let i = 0; i < psd.length; i++) psd[i] += r.psd[i];
    }
  }
  return { f: f!, psd: psd! };
}

function trim(ch: Float64Array, n: number): Float64Array {
  return ch.subarray(n, ch.length - n);
}

export function analyze(samples: Sample[], options: AnalysisOptions = {}): AnalysisResult {
  const fs = options.fs ?? DEFAULTS.fs;
  const trimS = options.trimS ?? DEFAULTS.trimS;
  const band = options.band ?? DEFAULTS.band;
  const welchSegmentS = options.welchSegmentS ?? DEFAULTS.welchSegmentS;
  const mode = options.mode ?? DEFAULTS.mode;
  const lfThreshold = options.lfMotionRmsThreshold ?? DEFAULTS.lfMotionRmsThreshold;

  if (samples.length < 2) throw new Error('analyze: not enough samples');

  // 1. timing
  const rawT = samples.map((s) => s.t);
  const timing = timingStats(rawT);

  // 2. uniform resample
  const { ch } = resampleUniform(samples, fs);

  // 3. trim
  const nTrim = Math.round(trimS * fs);
  const total = ch.x.length;
  if (total - 2 * nTrim < Math.round(welchSegmentS * fs)) {
    return failedResult(timing, samples.length, mode, [
      {
        flag: 'short_recording',
        fatal: true,
        message: `Recording too short (${Math.max(0, (total - 2 * nTrim) / fs).toFixed(0)} s usable)`,
      },
    ]);
  }
  const trimmed: Channels = { x: trim(ch.x, nTrim), y: trim(ch.y, nTrim), z: trim(ch.z, nTrim) };
  const durationS = trimmed.x.length / fs;
  const nperseg = Math.round(welchSegmentS * fs);

  // Channel set for the chosen mode
  let channels: Float64Array[];
  if (mode === 'magnitude') {
    const m = new Float64Array(trimmed.x.length);
    for (let i = 0; i < m.length; i++) {
      m[i] = Math.sqrt(trimmed.x[i] ** 2 + trimmed.y[i] ** 2 + trimmed.z[i] ** 2);
    }
    channels = [m];
  } else {
    channels = [trimmed.x, trimmed.y, trimmed.z];
  }

  // Low-frequency motion (before the high-pass). Welch removes the per-segment
  // mean, so gravity is gone and what is left in (0, 1] Hz is slow movement.
  const rawPsd = sumPsd(channels, fs, nperseg);
  const [lfLo, lfHi] = bandIndices(rawPsd.f, rawPsd.f[1], 1);
  const lfMotionRms = Math.sqrt(trapezoid(rawPsd.psd, rawPsd.f, lfLo, lfHi));

  // 4. high-pass 1 Hz, zero phase
  const hp = butter(4, 1, 'highpass', fs);
  const filtered = channels.map((c) => sosfiltfilt(hp, c));

  // 5. Welch PSD summed across channels
  const { f, psd } = sumPsd(filtered, fs, nperseg);

  // 6. metrics
  const [bLo, bHi] = bandIndices(f, band[0], band[1]);
  const kPeak = argmax(psd, bLo, bHi);
  const dominantHz = f[kPeak];
  const dominantHzInterp = refinePeak(f, psd, kPeak);
  const bandPower = trapezoid(psd, f, bLo, bHi);

  const [wLo, wHi] = bandIndices(f, 1, 20);
  const [pLo, pHi] = bandIndices(f, dominantHz - 1, dominantHz + 1);
  const widePower = trapezoid(psd, f, wLo, wHi);
  const peakRatio = widePower > 0 ? trapezoid(psd, f, pLo, pHi) / widePower : 0;

  const bp = butter(4, band, 'bandpass', fs);
  const banded = filtered.map((c) => sosfiltfilt(bp, c));
  const rms = rmsOfChannels(banded);
  const timeline = rmsTimeline(banded, fs, 1);

  let entropy = 0;
  {
    let sum = 0;
    for (let i = bLo; i <= bHi; i++) sum += psd[i];
    const nBins = bHi - bLo + 1;
    if (sum > 0 && nBins > 1) {
      let h = 0;
      for (let i = bLo; i <= bHi; i++) {
        const p = psd[i] / sum;
        if (p > 0) h -= p * Math.log(p);
      }
      entropy = h / Math.log(nBins);
    }
  }

  // 7. quality gates
  const issues: QualityIssue[] = [];
  if (timing.measuredFsHz < QUALITY_LIMITS.minFsHz) {
    issues.push({
      flag: 'low_sample_rate',
      fatal: true,
      message: `Sensor too slow (${timing.measuredFsHz.toFixed(0)} Hz measured, need ≥ ${QUALITY_LIMITS.minFsHz} Hz)`,
    });
  }
  if (durationS < QUALITY_LIMITS.minDurationS) {
    issues.push({
      flag: 'short_recording',
      fatal: true,
      message: `Recording too short (${durationS.toFixed(0)} s usable after trimming, need ≥ ${QUALITY_LIMITS.minDurationS} s)`,
    });
  }
  if (timing.jitter > QUALITY_LIMITS.maxJitter) {
    issues.push({
      flag: 'high_jitter',
      fatal: false,
      message: `Irregular sensor timing (jitter ${timing.jitter.toFixed(2)}); frequency estimate may be less precise`,
    });
  }
  if (peakRatio < QUALITY_LIMITS.minPeakRatio) {
    issues.push({
      flag: 'weak_peak',
      fatal: false,
      message: 'No clear tremor peak; the result may be noise',
    });
  }
  if (lfMotionRms > lfThreshold) {
    issues.push({
      flag: 'low_frequency_motion',
      fatal: false,
      message: 'Large slow movement detected; try to keep the hand and phone still',
    });
  }

  return {
    measuredFsHz: timing.measuredFsHz,
    jitter: timing.jitter,
    durationS,
    rawDurationS: timing.durationS,
    rawSampleCount: samples.length,
    mode,
    dominantHz,
    dominantHzInterp,
    bandPower,
    peakRatio,
    rms,
    spectralEntropy: entropy,
    lfMotionRms,
    spectrum: { f, psd },
    rmsTimeline: timeline,
    issues,
    ok: !issues.some((i) => i.fatal),
  };
}

function failedResult(
  timing: ReturnType<typeof timingStats>,
  rawSampleCount: number,
  mode: AnalysisMode,
  issues: QualityIssue[],
): AnalysisResult {
  return {
    measuredFsHz: timing.measuredFsHz,
    jitter: timing.jitter,
    durationS: 0,
    rawDurationS: timing.durationS,
    rawSampleCount,
    mode,
    dominantHz: 0,
    dominantHzInterp: 0,
    bandPower: 0,
    peakRatio: 0,
    rms: 0,
    spectralEntropy: 0,
    lfMotionRms: 0,
    spectrum: { f: new Float64Array(0), psd: new Float64Array(0) },
    rmsTimeline: new Float64Array(0),
    issues,
    ok: false,
  };
}
