import { analyze, QUALITY_LIMITS } from '../analyze';
import { liveEstimate } from '../live';
import { interp, resampleUniform, timingStats } from '../resample';
import type { Sample } from '../types';
import { expectRelClose, loadCsvFixture, loadReference } from './helpers';
import { synth } from './synth';

const ref = loadReference();
const G = 9.80665;

/** Map Python warning strings to our flags, for the quality-gate parity test. */
function pyWarningFlags(warnings: string[]): string[] {
  const flags: string[] = [];
  for (const w of warnings) {
    if (w.startsWith('low sample rate')) flags.push('low_sample_rate');
    else if (w.startsWith('irregular timestamps')) flags.push('high_jitter');
    else if (w.startsWith('short recording')) flags.push('short_recording');
    else if (w.startsWith('no clear spectral peak')) flags.push('weak_peak');
  }
  return flags.sort();
}

describe('analyze() reproduces tremor_analyze.py on identical inputs', () => {
  for (const c of ref.synthetic) {
    test(`${c.name}: dominant / RMS / band power / peak ratio / warnings`, () => {
      const samples = synth({ freq: c.freq, amp: c.amp, dur: c.dur, fsRaw: c.fs_raw, noise: c.noise, seed: c.seed });
      const r = analyze(samples);
      const e = c.expected;

      expectRelClose(r.measuredFsHz, e.raw_fs, 1e-9);
      expect(r.durationS).toBeCloseTo(e.duration_s, 9);
      // Same bin must win; PSD bins are exact multiples of 0.25 Hz.
      expect(r.dominantHz).toBe(e.dominant_hz);
      expectRelClose(r.rms, e.rms, 1e-7);
      expectRelClose(r.bandPower, e.band_power, 1e-7);
      expectRelClose(r.peakRatio, e.peak_ratio, 1e-7);

      const ourFlags = r.issues
        .map((i) => i.flag)
        .filter((f) => f !== 'low_frequency_motion')
        .sort();
      expect(ourFlags).toEqual(pyWarningFlags(e.warnings));
    });
  }
});

describe('cross-implementation: the same CSV through both pipelines', () => {
  for (const c of ref.csv) {
    test(`${c.file}: dominant within 0.25 Hz, RMS within 10% (actual match is far tighter)`, () => {
      const samples = loadCsvFixture(c.file);
      const r = analyze(samples);
      expect(Math.abs(r.dominantHz - c.expected.dominant_hz)).toBeLessThanOrEqual(0.25);
      expectRelClose(r.rms, c.expected.rms, 0.1);
      // and the tight check, since it is literally the same algorithm:
      expect(r.dominantHz).toBe(c.expected.dominant_hz);
      expectRelClose(r.rms, c.expected.rms, 1e-6);
      expectRelClose(r.peakRatio, c.expected.peak_ratio, 1e-6);
    });
  }
});

describe('spec tolerances from the brief (section 8.1)', () => {
  const freqs = [4.5, 6, 8, 10];
  const amps = [0.05, 0.2, 0.8];

  test.each(freqs)('%s Hz is found within ±0.25 Hz at every amplitude (input in g)', (f) => {
    for (const a of amps) {
      const samples = synth({ freq: f, amp: a, seed: 100 + f * 10 + a * 100, scale: 1 / G });
      const r = analyze(samples);
      expect(r.ok).toBe(true);
      expect(Math.abs(r.dominantHz - f)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(r.dominantHzInterp - f)).toBeLessThanOrEqual(0.25);
    }
  });

  test.each(freqs)('%s Hz: RMS is monotonic with amplitude', (f) => {
    const rms = amps.map((a) => analyze(synth({ freq: f, amp: a, seed: 7, scale: 1 / G })).rms);
    expect(rms[0]).toBeLessThan(rms[1]);
    expect(rms[1]).toBeLessThan(rms[2]);
  });

  test('units pass straight through: g input gives RMS = m/s² RMS / 9.80665', () => {
    const ms2 = analyze(synth({ freq: 6, amp: 0.2, seed: 3 })).rms;
    const g = analyze(synth({ freq: 6, amp: 0.2, seed: 3, scale: 1 / G })).rms;
    expectRelClose(g * G, ms2, 1e-9);
  });

  test('a phone lying still produces a weak-peak warning and a tiny RMS', () => {
    const r = analyze(synth({ freq: 6, amp: 0, noise: 0.002, seed: 11, fsRaw: 100, scale: 1 / G }));
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.flag === 'weak_peak')).toBe(true);
    expect(r.rms).toBeLessThan(0.002);
  });

  test('spectral entropy is low for a pure tone and high for noise', () => {
    const tone = analyze(synth({ freq: 6, amp: 0.8, seed: 5 }));
    const noise = analyze(synth({ freq: 6, amp: 0, noise: 0.1, seed: 5 }));
    expect(tone.spectralEntropy).toBeLessThan(0.5);
    expect(noise.spectralEntropy).toBeGreaterThan(0.85);
    expect(noise.spectralEntropy).toBeLessThanOrEqual(1);
  });

  test('parabolic interpolation refines an off-bin frequency', () => {
    const r = analyze(synth({ freq: 6.1, amp: 0.5, seed: 9, fsRaw: 100 }));
    expect(r.dominantHz).toBe(6);
    expect(Math.abs(r.dominantHzInterp - 6.1)).toBeLessThan(0.08);
  });

  test('rmsTimeline has one entry per usable second', () => {
    const r = analyze(synth({ freq: 6, amp: 0.2, seed: 2 }));
    expect(r.rmsTimeline.length).toBe(Math.floor(r.durationS));
  });
});

describe('analysis modes', () => {
  test('magnitude (device-parity) mode finds the same dominant frequency', () => {
    const samples = synth({ freq: 8, amp: 0.3, seed: 21, scale: 1 / G });
    const axes = analyze(samples, { mode: 'axes' });
    const mag = analyze(samples, { mode: 'magnitude' });
    expect(mag.mode).toBe('magnitude');
    expect(mag.dominantHz).toBe(axes.dominantHz);
    // magnitude projects the motion onto gravity, so RMS differs but stays the same order
    expect(mag.rms).toBeGreaterThan(axes.rms * 0.3);
    expect(mag.rms).toBeLessThan(axes.rms * 1.5);
  });
});

describe('quality gates', () => {
  test('sensor too slow is fatal', () => {
    const r = analyze(synth({ freq: 6, amp: 0.2, fsRaw: 30, seed: 1 }));
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.flag === 'low_sample_rate')?.fatal).toBe(true);
    expect(r.measuredFsHz).toBeLessThan(QUALITY_LIMITS.minFsHz);
  });

  test('short recording (after trim) is fatal', () => {
    const r = analyze(synth({ freq: 6, amp: 0.2, dur: 15, fsRaw: 100, seed: 1 }));
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.flag === 'short_recording')?.fatal).toBe(true);
  });

  test('a recording too short to even trim returns a fatal result instead of throwing', () => {
    const r = analyze(synth({ freq: 6, amp: 0.2, dur: 5, fsRaw: 100, seed: 1 }));
    expect(r.ok).toBe(false);
    expect(r.issues[0].flag).toBe('short_recording');
  });

  test('irregular timestamps warn but do not fail', () => {
    const base = synth({ freq: 6, amp: 0.2, fsRaw: 100, seed: 4, scale: 1 / G });
    // Make every other sample arrive late: dt alternates 2 ms / 18 ms (jitter ~0.8)
    const jittery: Sample[] = base.map((s, i) => ({ ...s, t: Math.floor(i / 2) * 0.02 + (i % 2) * 0.002 }));
    const r = analyze(jittery);
    expect(r.jitter).toBeGreaterThan(QUALITY_LIMITS.maxJitter);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.flag === 'high_jitter' && !i.fatal)).toBe(true);
    expect(Math.abs(r.dominantHz - 6)).toBeLessThanOrEqual(0.25);
  });

  test('slow drifting motion triggers the low-frequency warning', () => {
    const samples = synth({ freq: 6, amp: 0.2, fsRaw: 100, seed: 6, scale: 1 / G }).map((s) => ({
      ...s,
      x: s.x + 0.3 * Math.sin(2 * Math.PI * 0.4 * s.t),
    }));
    const r = analyze(samples);
    expect(r.issues.some((i) => i.flag === 'low_frequency_motion')).toBe(true);
    // the 1 Hz high-pass still isolates the tremor
    expect(r.dominantHz).toBe(6);
  });
});

describe('resample helpers', () => {
  test('interp matches numpy.interp semantics (clamping at the ends)', () => {
    const y = interp([-1, 0, 0.5, 1, 2, 3], [0, 1, 2], [10, 20, 40]);
    expect(Array.from(y)).toEqual([10, 10, 15, 20, 40, 40]);
  });

  test('resampleUniform produces ceil(T*fs) points starting at t=0', () => {
    const samples = synth({ freq: 6, amp: 0.2, seed: 1 });
    const { t, ch } = resampleUniform(samples, 100);
    const span = samples[samples.length - 1].t - samples[0].t;
    expect(t.length).toBe(Math.ceil(span * 100));
    expect(t[0]).toBe(0);
    expect(ch.x.length).toBe(t.length);
  });

  test('timingStats: 100 Hz uniform has fs=100 and jitter 0', () => {
    const t = Array.from({ length: 1001 }, (_, i) => i / 100);
    const s = timingStats(t);
    expect(s.measuredFsHz).toBeCloseTo(100, 9);
    expect(s.jitter).toBeLessThan(1e-9);
    expect(s.durationS).toBeCloseTo(10, 9);
  });
});

describe('liveEstimate', () => {
  test('finds the tremor frequency in a 2 s window', () => {
    const all = synth({ freq: 6, amp: 0.4, fsRaw: 100, seed: 8, scale: 1 / G });
    const recent = all.slice(1000, 1200);
    const e = liveEstimate(recent);
    expect(e.dominantHz).not.toBeNull();
    expect(Math.abs((e.dominantHz ?? 0) - 6)).toBeLessThan(0.5);
    expect(e.rms).toBeGreaterThan(0);
  });

  test('returns null when there is not enough data yet', () => {
    const all = synth({ freq: 6, amp: 0.4, fsRaw: 100, seed: 8 });
    expect(liveEstimate(all.slice(0, 20)).dominantHz).toBeNull();
  });
});
