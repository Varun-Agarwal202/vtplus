/**
 * Portable synthetic tremor signal generator. Mirrors `synth_portable()` in
 * scripts/make_fixtures.py exactly (same PRNG, same draw order) so that the
 * Python reference and the TS pipeline see identical inputs.
 */
import type { Sample } from '../types';

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNormal(rnd: () => number): () => number {
  return () => {
    const u1 = 1 - rnd();
    const u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

export interface SynthOptions {
  freq: number;
  amp: number;
  dur?: number;
  fsRaw?: number;
  noise?: number;
  seed?: number;
  gravity?: number;
  /** multiply all accelerations by this (e.g. 1/9.80665 to get g) */
  scale?: number;
}

export function synth(o: SynthOptions): Sample[] {
  const dur = o.dur ?? 30;
  const fsRaw = o.fsRaw ?? 60;
  const noise = o.noise ?? 0.02;
  const gravity = o.gravity ?? 9.81;
  const scale = o.scale ?? 1;
  const rnd = mulberry32(o.seed ?? 1);
  const normal = makeNormal(rnd);
  const n = Math.floor(dur * fsRaw);

  const t = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += 1 / fsRaw + 0.002 * normal();
    t[i] = acc;
  }
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const nz = new Float64Array(n);
  for (let i = 0; i < n; i++) nx[i] = normal();
  for (let i = 0; i < n; i++) ny[i] = normal();
  for (let i = 0; i < n; i++) nz[i] = normal();

  const out: Sample[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = o.amp * Math.sin(2 * Math.PI * o.freq * t[i]);
    out[i] = {
      t: t[i],
      x: (0.3 * s + noise * nx[i]) * scale,
      y: (0.5 * s + noise * ny[i]) * scale,
      z: (gravity + 0.8 * s + noise * nz[i]) * scale,
    };
  }
  return out;
}
