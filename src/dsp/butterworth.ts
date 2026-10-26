/**
 * Butterworth IIR design in second-order sections, following the same route
 * scipy takes in `scipy.signal.butter(N, Wn, btype, fs=fs, output="sos")`:
 *
 *   analog prototype (buttap) -> frequency pre-warp -> lp2lp / lp2hp / lp2bp
 *   -> bilinear transform -> group poles/zeros into biquads.
 *
 * Section pairing differs from scipy's `zpk2sos` (we pair conjugate poles in
 * order and distribute zeros evenly), but the overall transfer function is the
 * same, and so is the `sosfiltfilt` output up to floating-point rounding.
 *
 * Only what the tremor pipeline needs is implemented: lowpass, highpass, and
 * bandpass. Order must be even for bandpass sections to be whole biquads.
 */

export type ButterType = 'lowpass' | 'highpass' | 'bandpass';

/** One second-order section: [b0, b1, b2, a0, a1, a2] with a0 = 1. */
export type Section = [number, number, number, number, number, number];
export type SOS = Section[];

interface C {
  re: number;
  im: number;
}

const c = (re: number, im = 0): C => ({ re, im });
const cadd = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
const csub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
const cmul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const csqrt = (a: C): C => {
  const r = Math.hypot(a.re, a.im);
  const re = Math.sqrt(Math.max(0, (r + a.re) / 2));
  let im = Math.sqrt(Math.max(0, (r - a.re) / 2));
  if (a.im < 0) im = -im;
  return c(re, im);
};
const cscale = (a: C, s: number): C => c(a.re * s, a.im * s);
const cprod = (arr: C[]): C => arr.reduce((acc, v) => cmul(acc, v), c(1, 0));

/** Analog Butterworth prototype poles (scipy `buttap`). */
function buttap(order: number): C[] {
  const poles: C[] = [];
  for (let m = -order + 1; m < order; m += 2) {
    const ang = (Math.PI * m) / (2 * order);
    // p = -exp(1j * ang)
    poles.push(c(-Math.cos(ang), -Math.sin(ang)));
  }
  return poles;
}

interface ZPK {
  z: C[];
  p: C[];
  k: number;
}

function lp2lp(zpk: ZPK, wo: number): ZPK {
  const degree = zpk.p.length - zpk.z.length;
  return {
    z: zpk.z.map((v) => cscale(v, wo)),
    p: zpk.p.map((v) => cscale(v, wo)),
    k: zpk.k * Math.pow(wo, degree),
  };
}

function lp2hp(zpk: ZPK, wo: number): ZPK {
  const degree = zpk.p.length - zpk.z.length;
  const z = zpk.z.map((v) => cdiv(c(wo), v));
  const p = zpk.p.map((v) => cdiv(c(wo), v));
  for (let i = 0; i < degree; i++) z.push(c(0));
  const num = cprod(zpk.z.map((v) => cscale(v, -1)));
  const den = cprod(zpk.p.map((v) => cscale(v, -1)));
  const k = zpk.k * cdiv(num, den).re;
  return { z, p, k };
}

function lp2bp(zpk: ZPK, wo: number, bw: number): ZPK {
  const degree = zpk.p.length - zpk.z.length;
  const zl = zpk.z.map((v) => cscale(v, bw / 2));
  const pl = zpk.p.map((v) => cscale(v, bw / 2));
  const wo2 = c(wo * wo);
  const expand = (arr: C[]): C[] => {
    const out: C[] = [];
    for (const v of arr) out.push(cadd(v, csqrt(csub(cmul(v, v), wo2))));
    for (const v of arr) out.push(csub(v, csqrt(csub(cmul(v, v), wo2))));
    return out;
  };
  const z = expand(zl);
  const p = expand(pl);
  for (let i = 0; i < degree; i++) z.push(c(0));
  return { z, p, k: zpk.k * Math.pow(bw, degree) };
}

function bilinear(zpk: ZPK, fs: number): ZPK {
  const degree = zpk.p.length - zpk.z.length;
  const fs2 = c(2 * fs);
  const z = zpk.z.map((v) => cdiv(cadd(fs2, v), csub(fs2, v)));
  const p = zpk.p.map((v) => cdiv(cadd(fs2, v), csub(fs2, v)));
  for (let i = 0; i < degree; i++) z.push(c(-1));
  const num = cprod(zpk.z.map((v) => csub(fs2, v)));
  const den = cprod(zpk.p.map((v) => csub(fs2, v)));
  const k = zpk.k * cdiv(num, den).re;
  return { z, p, k };
}

/** Quadratic coefficients [1, c1, c2] for the pair of roots (r1, r2). */
function pairToPoly(r1: C, r2: C): [number, number, number] {
  const s = cadd(r1, r2);
  const pr = cmul(r1, r2);
  return [1, -s.re, pr.re];
}

/**
 * Group roots into pairs. Complex roots are matched with their conjugates;
 * real roots are paired by sorting and matching the largest with the smallest
 * (so bandpass zeros at +1 and -1 land in the same section).
 */
function pairRoots(roots: C[]): [C, C][] {
  const eps = 1e-10;
  const complex = roots.filter((r) => Math.abs(r.im) > eps);
  const real = roots.filter((r) => Math.abs(r.im) <= eps).sort((a, b) => a.re - b.re);
  const pairs: [C, C][] = [];

  const used = new Array(complex.length).fill(false);
  for (let i = 0; i < complex.length; i++) {
    if (used[i]) continue;
    let best = -1;
    let bestDist = Infinity;
    for (let j = i + 1; j < complex.length; j++) {
      if (used[j]) continue;
      const d = Math.hypot(complex[i].re - complex[j].re, complex[i].im + complex[j].im);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best < 0) throw new Error('butterworth: unpaired complex root');
    used[i] = used[best] = true;
    pairs.push([complex[i], complex[best]]);
  }

  if (real.length % 2 !== 0) throw new Error('butterworth: odd number of real roots (use an even order)');
  let lo = 0;
  let hi = real.length - 1;
  while (lo < hi) {
    pairs.push([real[lo], real[hi]]);
    lo++;
    hi--;
  }
  return pairs;
}

function zpk2sos(zpk: ZPK): SOS {
  const { z, p, k } = zpk;
  if (p.length !== z.length) throw new Error('zpk2sos: expected equal number of poles and zeros');
  if (p.length % 2 !== 0) throw new Error('zpk2sos: odd order is not supported');
  const polePairs = pairRoots(p);
  const zeroPairs = pairRoots(z);
  // Sort pole pairs by distance from the unit circle (closest first, like scipy),
  // so the most selective sections are applied first.
  polePairs.sort((a, b) => Math.hypot(b[0].re, b[0].im) - Math.hypot(a[0].re, a[0].im));
  const sos: SOS = [];
  for (let i = 0; i < polePairs.length; i++) {
    const [a0, a1, a2] = pairToPoly(polePairs[i][0], polePairs[i][1]);
    const [b0, b1, b2] = pairToPoly(zeroPairs[i][0], zeroPairs[i][1]);
    const g = i === 0 ? k : 1;
    sos.push([b0 * g, b1 * g, b2 * g, a0, a1, a2]);
  }
  return sos;
}

/**
 * Design a digital Butterworth filter as SOS.
 *
 * @param order  filter order (even)
 * @param cutoff cutoff in Hz; a number for low/highpass, [lo, hi] for bandpass
 * @param type   'lowpass' | 'highpass' | 'bandpass'
 * @param fs     sampling rate in Hz
 */
export function butter(order: number, cutoff: number | [number, number], type: ButterType, fs: number): SOS {
  if (!Number.isInteger(order) || order < 2 || order % 2 !== 0) {
    throw new Error('butter: order must be a positive even integer');
  }
  const nyq = fs / 2;
  const toWn = (f: number) => {
    const wn = f / nyq;
    if (!(wn > 0 && wn < 1)) throw new Error(`butter: cutoff ${f} Hz out of range for fs=${fs}`);
    return wn;
  };
  // scipy uses a fixed internal fs = 2.0 for the bilinear transform and warps
  // the normalized cutoff accordingly.
  const fsInternal = 2.0;
  const warp = (wn: number) => 2 * fsInternal * Math.tan((Math.PI * wn) / fsInternal);

  let zpk: ZPK = { z: [], p: buttap(order), k: 1 };
  if (type === 'bandpass') {
    if (!Array.isArray(cutoff)) throw new Error('butter: bandpass needs [lo, hi]');
    const w1 = warp(toWn(cutoff[0]));
    const w2 = warp(toWn(cutoff[1]));
    if (!(w2 > w1)) throw new Error('butter: bandpass hi must be > lo');
    zpk = lp2bp(zpk, Math.sqrt(w1 * w2), w2 - w1);
  } else {
    if (Array.isArray(cutoff)) throw new Error(`butter: ${type} needs a single cutoff`);
    const wo = warp(toWn(cutoff));
    zpk = type === 'lowpass' ? lp2lp(zpk, wo) : lp2hp(zpk, wo);
  }
  zpk = bilinear(zpk, fsInternal);
  return zpk2sos(zpk);
}
