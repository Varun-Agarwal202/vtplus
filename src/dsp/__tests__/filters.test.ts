import { butter } from '../butterworth';
import { sosfilt, sosfiltfilt } from '../sosfilt';
import { loadReference, maxAbsDiff, sosMagnitude } from './helpers';

const ref = loadReference();

describe('butter() vs scipy.signal.butter', () => {
  for (const fx of ref.filters) {
    describe(fx.name, () => {
      const sos = butter(fx.order, fx.cutoff, fx.type, fx.fs);

      test('has order/2 sections with a0 = 1', () => {
        expect(sos.length).toBe(fx.type === 'bandpass' ? fx.order : fx.order / 2);
        for (const s of sos) expect(s[3]).toBeCloseTo(1, 12);
      });

      test('frequency response magnitude matches sosfreqz', () => {
        fx.freqz_hz.forEach((f, i) => {
          const mag = sosMagnitude(sos, f, fx.fs);
          expect(Math.abs(mag - fx.freqz_mag[i])).toBeLessThan(1e-9);
        });
      });

      test('sosfilt output matches scipy', () => {
        const { y } = sosfilt(sos, fx.input);
        expect(maxAbsDiff(y, fx.sosfilt)).toBeLessThan(1e-9);
      });

      test('sosfiltfilt output matches scipy (odd padding, sosfilt_zi)', () => {
        const y = sosfiltfilt(sos, fx.input);
        expect(maxAbsDiff(y, fx.sosfiltfilt)).toBeLessThan(1e-9);
      });
    });
  }

  test('rejects odd orders and out-of-range cutoffs', () => {
    expect(() => butter(3, 1, 'highpass', 100)).toThrow();
    expect(() => butter(4, 60, 'lowpass', 100)).toThrow();
    expect(() => butter(4, [12, 4], 'bandpass', 100)).toThrow();
  });

  test('highpass passes a 6 Hz tone and removes a constant offset', () => {
    const fs = 100;
    const sos = butter(4, 1, 'highpass', fs);
    const n = 1000;
    const x = Array.from({ length: n }, (_, i) => 1 + Math.sin((2 * Math.PI * 6 * i) / fs));
    const y = sosfiltfilt(sos, x);
    let mean = 0;
    let energy = 0;
    for (let i = 200; i < n - 200; i++) {
      mean += y[i];
      energy += y[i] ** 2;
    }
    mean /= n - 400;
    const rms = Math.sqrt(energy / (n - 400));
    expect(Math.abs(mean)).toBeLessThan(1e-3);
    expect(rms).toBeCloseTo(Math.SQRT1_2, 2);
  });
});
