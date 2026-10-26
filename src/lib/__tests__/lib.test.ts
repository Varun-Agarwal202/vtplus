import { analyze } from '@/dsp';
import { synth } from '@/dsp/__tests__/synth';
import { decodeSpectrum, encodeSpectrum } from '../spectrum-json';
import { G, formatAccel, formatChange, fromG, powerFromG } from '../units';

describe('units', () => {
  test('g <-> m/s² conversion', () => {
    expect(fromG(1, 'g')).toBe(1);
    expect(fromG(1, 'ms2')).toBeCloseTo(G, 12);
    expect(powerFromG(1, 'ms2')).toBeCloseTo(G * G, 9);
    expect(formatAccel(0.01, 'g')).toBe('0.0100 g');
    expect(formatAccel(0.01, 'ms2')).toBe('0.098 m/s²');
  });

  test('formatChange is neutral wording with a sign', () => {
    expect(formatChange(1.1, 1)).toBe('+10%');
    expect(formatChange(0.9, 1)).toBe('−10%');
    expect(formatChange(1.001, 1)).toBe('no change');
    expect(formatChange(1, 0)).toBe('—');
  });
});

describe('spectrum JSON', () => {
  test('round-trips the PSD up to 20 Hz on a uniform grid', () => {
    const r = analyze(synth({ freq: 6, amp: 0.3, fsRaw: 100, seed: 3, scale: 1 / G }));
    const json = encodeSpectrum(r.spectrum);
    expect(json).not.toBeNull();
    expect(json!.length).toBeLessThan(4000);
    const s = decodeSpectrum(json)!;
    expect(s.f[0]).toBe(0);
    expect(s.f[1]).toBeCloseTo(0.25, 12);
    expect(s.f[s.f.length - 1]).toBeCloseTo(20, 9);
    for (let i = 0; i < s.psd.length; i++) {
      const rel = Math.abs(s.psd[i] - r.spectrum.psd[i]) / Math.max(r.spectrum.psd[i], 1e-30);
      expect(rel).toBeLessThan(1e-5);
    }
  });

  test('decode tolerates garbage', () => {
    expect(decodeSpectrum(null)).toBeNull();
    expect(decodeSpectrum('not json')).toBeNull();
    expect(decodeSpectrum('{"x":1}')).toBeNull();
  });
});
