import * as fs from 'fs';
import * as path from 'path';

import type { SOS } from '../butterworth';
import type { Sample } from '../types';

export interface ExpectedMetrics {
  raw_fs: number;
  duration_s: number;
  dominant_hz: number;
  band_power: number;
  rms: number;
  peak_ratio: number;
  warnings: string[];
}

export interface ReferenceFixture {
  synthetic: {
    name: string;
    freq: number;
    amp: number;
    dur: number;
    fs_raw: number;
    noise: number;
    seed: number;
    expected: ExpectedMetrics;
  }[];
  filters: {
    name: string;
    order: number;
    cutoff: number | [number, number];
    type: 'lowpass' | 'highpass' | 'bandpass';
    fs: number;
    input: number[];
    sosfiltfilt: number[];
    sosfilt: number[];
    freqz_hz: number[];
    freqz_mag: number[];
  }[];
  welch: { fs: number; nperseg: number; noverlap: number; input: number[]; f: number[]; psd: number[] };
  csv: { file: string; freq: number; amp: number; expected: ExpectedMetrics }[];
}

export const FIXTURES_DIR = path.join(__dirname, 'fixtures');

export function loadReference(): ReferenceFixture {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'reference.json'), 'utf8')) as ReferenceFixture;
}

/** Parse a Phyphox-style CSV (time, x, y, z; header row; quoted or not). */
export function parseCsv(text: string): Sample[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: Sample[] = [];
  for (const line of lines) {
    const cols = line.split(',').map((c) => c.replace(/"/g, '').trim());
    const nums = cols.map(Number);
    if (nums.some((v) => Number.isNaN(v))) continue; // header
    out.push({ t: nums[0], x: nums[1], y: nums[2], z: nums[3] });
  }
  return out;
}

export function loadCsvFixture(name: string): Sample[] {
  return parseCsv(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

/** |H(e^{jw})| of an SOS cascade at frequency f (Hz). */
export function sosMagnitude(sos: SOS, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  const c1 = Math.cos(-w);
  const s1 = Math.sin(-w);
  const c2 = Math.cos(-2 * w);
  const s2 = Math.sin(-2 * w);
  let mag = 1;
  for (const [b0, b1, b2, a0, a1, a2] of sos) {
    const nRe = b0 + b1 * c1 + b2 * c2;
    const nIm = b1 * s1 + b2 * s2;
    const dRe = a0 + a1 * c1 + a2 * c2;
    const dIm = a1 * s1 + a2 * s2;
    mag *= Math.hypot(nRe, nIm) / Math.hypot(dRe, dIm);
  }
  return mag;
}

export function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  expect(a.length).toBe(b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

export function maxRelDiff(a: ArrayLike<number>, b: ArrayLike<number>, floor = 1e-12): number {
  expect(a.length).toBe(b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), floor);
    m = Math.max(m, d);
  }
  return m;
}

export function expectRelClose(actual: number, expected: number, rel: number): void {
  const diff = Math.abs(actual - expected);
  const tol = rel * Math.max(Math.abs(expected), 1e-300);
  if (diff > tol) {
    throw new Error(`expected ${actual} to be within ${rel * 100}% of ${expected} (diff ${diff}, tol ${tol})`);
  }
}
