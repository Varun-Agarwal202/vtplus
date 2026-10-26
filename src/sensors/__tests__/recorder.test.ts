import { DEFAULTS, MIN_RAW_S, QUALITY_LIMITS } from '@/dsp';
import { chooseTimestampSource } from '../recorder';

describe('early stop threshold', () => {
  test('I’m done unlocks once the recording would still have 20 s after trimming', () => {
    expect(MIN_RAW_S).toBe(QUALITY_LIMITS.minDurationS + 2 * DEFAULTS.trimS);
    expect(MIN_RAW_S).toBe(24);
  });
});

describe('chooseTimestampSource', () => {
  const receipt = Array.from({ length: 100 }, (_, i) => i * 0.01 + (i % 3) * 0.001);

  test('prefers consistent native timestamps', () => {
    const native = Array.from({ length: 100 }, (_, i) => 12345 + i * 0.01);
    expect(chooseTimestampSource(native, receipt)).toBe('native');
  });

  test('falls back when native timestamps are missing or non-monotonic', () => {
    expect(chooseTimestampSource(receipt.map(() => NaN), receipt)).toBe('receipt');
    const nonMono = receipt.map((t, i) => (i === 50 ? t - 1 : t));
    expect(chooseTimestampSource(nonMono, receipt)).toBe('receipt');
  });

  test('falls back when native units disagree with receipt timing (e.g. ns vs s)', () => {
    const ns = Array.from({ length: 100 }, (_, i) => i * 1e7);
    expect(chooseTimestampSource(ns, receipt)).toBe('receipt');
  });

  test('too few samples -> receipt', () => {
    expect(chooseTimestampSource([1, 2], [0, 0.01])).toBe('receipt');
  });
});
