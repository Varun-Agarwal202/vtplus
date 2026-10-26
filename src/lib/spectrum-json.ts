import type { Spectrum } from '@/dsp/types';

interface Compact {
  f0: number;
  df: number;
  psd: number[];
}

/** Store the PSD up to `maxHz` as a compact JSON string (uniform grid assumed). */
export function encodeSpectrum(s: Spectrum, maxHz = 20): string | null {
  if (s.f.length < 2) return null;
  const df = s.f[1] - s.f[0];
  const psd: number[] = [];
  for (let i = 0; i < s.f.length && s.f[i] <= maxHz + 1e-9; i++) psd.push(Number(s.psd[i].toPrecision(6)));
  const c: Compact = { f0: s.f[0], df, psd };
  return JSON.stringify(c);
}

export function decodeSpectrum(json: string | null): Spectrum | null {
  if (!json) return null;
  try {
    const c = JSON.parse(json) as Compact;
    if (!Array.isArray(c.psd) || typeof c.df !== 'number') return null;
    const f = new Float64Array(c.psd.length);
    for (let i = 0; i < f.length; i++) f[i] = c.f0 + i * c.df;
    return { f, psd: Float64Array.from(c.psd) };
  } catch {
    return null;
  }
}
