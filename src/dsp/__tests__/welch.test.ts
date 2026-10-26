import { hannPeriodic, trapezoid, welch } from '../welch';
import { loadReference, maxRelDiff } from './helpers';

const ref = loadReference();

describe('welch() vs scipy.signal.welch', () => {
  test('periodic Hann window matches scipy.signal.get_window("hann", N)', () => {
    const w = hannPeriodic(8);
    // scipy: [0, 0.14644661, 0.5, 0.85355339, 1, 0.85355339, 0.5, 0.14644661]
    expect(w[0]).toBeCloseTo(0, 12);
    expect(w[1]).toBeCloseTo(0.14644661, 7);
    expect(w[4]).toBeCloseTo(1, 12);
    expect(w[7]).toBeCloseTo(0.14644661, 7);
  });

  test('frequency grid and PSD match the fixture', () => {
    const fx = ref.welch;
    const r = welch(fx.input, fx.fs, fx.nperseg, fx.noverlap);
    expect(r.segments).toBe(Math.floor((fx.input.length - fx.noverlap) / (fx.nperseg - fx.noverlap)));
    expect(maxRelDiff(r.f, fx.f)).toBeLessThan(1e-12);
    // relative error with a floor so near-zero bins don't dominate
    expect(maxRelDiff(r.psd, fx.psd, 1e-9)).toBeLessThan(1e-8);
  });

  test('Parseval-ish: integrated one-sided density ~ variance of a sine', () => {
    const fs = 100;
    const n = 4000;
    const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 6 * i) / fs));
    const { f, psd } = welch(x, fs, 400);
    const total = trapezoid(psd, f);
    expect(total).toBeCloseTo(0.5, 1);
  });

  test('trapezoid integrates a line exactly', () => {
    const x = [0, 1, 2, 3];
    const y = [0, 2, 4, 6];
    expect(trapezoid(y, x)).toBeCloseTo(9, 12);
    expect(trapezoid(y, x, 1, 2)).toBeCloseTo(3, 12);
  });

  test('throws when the input is shorter than one segment', () => {
    expect(() => welch(new Float64Array(100), 100, 400)).toThrow();
  });
});
