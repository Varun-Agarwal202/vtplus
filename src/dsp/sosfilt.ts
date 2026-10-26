/**
 * Second-order-section filtering, matching scipy.signal:
 *   - `sosfilt`     direct form II transposed, with optional initial state
 *   - `sosfiltZi`   steady-state initial conditions for a unit step
 *   - `sosfiltfilt` zero-phase forward-backward filtering with odd-extension
 *                   padding of length 3 * ntaps (scipy's default)
 */
import type { SOS } from './butterworth';

/** Per-section state (2 values each), flattened: [z0_s0, z1_s0, z0_s1, z1_s1, ...] */
export type SosState = Float64Array;

export function sosfilt(sos: SOS, x: ArrayLike<number>, zi?: SosState): { y: Float64Array; zf: SosState } {
  const nSec = sos.length;
  const n = x.length;
  const y = new Float64Array(n);
  const z = zi ? Float64Array.from(zi) : new Float64Array(nSec * 2);
  for (let i = 0; i < n; i++) {
    let v = x[i];
    for (let s = 0; s < nSec; s++) {
      const [b0, b1, b2, , a1, a2] = sos[s];
      const zi0 = z[2 * s];
      const zi1 = z[2 * s + 1];
      const out = b0 * v + zi0;
      z[2 * s] = b1 * v - a1 * out + zi1;
      z[2 * s + 1] = b2 * v - a2 * out;
      v = out;
    }
    y[i] = v;
  }
  return { y, zf: z };
}

/** scipy.signal.lfilter_zi for a 2nd-order section with a0 = 1. */
function lfilterZi2(b0: number, b1: number, b2: number, a1: number, a2: number): [number, number] {
  // Solve (I - A^T) zi = B, with A the companion matrix of a = [1, a1, a2]:
  //   I - A^T = [[1 + a1, -1], [a2, 1]],   B = [b1 - a1*b0, b2 - a2*b0]
  const m00 = 1 + a1;
  const m01 = -1;
  const m10 = a2;
  const m11 = 1;
  const B0 = b1 - a1 * b0;
  const B1 = b2 - a2 * b0;
  const det = m00 * m11 - m01 * m10;
  const z0 = (B0 * m11 - m01 * B1) / det;
  const z1 = (m00 * B1 - m10 * B0) / det;
  return [z0, z1];
}

/** scipy.signal.sosfilt_zi */
export function sosfiltZi(sos: SOS): SosState {
  const zi = new Float64Array(sos.length * 2);
  let scale = 1;
  for (let s = 0; s < sos.length; s++) {
    const [b0, b1, b2, a0, a1, a2] = sos[s];
    const [z0, z1] = lfilterZi2(b0, b1, b2, a1, a2);
    zi[2 * s] = scale * z0;
    zi[2 * s + 1] = scale * z1;
    scale *= (b0 + b1 + b2) / (a0 + a1 + a2);
  }
  return zi;
}

function oddExt(x: ArrayLike<number>, edge: number): Float64Array {
  const n = x.length;
  if (edge === 0) return Float64Array.from(x);
  if (edge >= n) throw new Error(`sosfiltfilt: input length ${n} must be > padlen ${edge}`);
  const out = new Float64Array(n + 2 * edge);
  const first = x[0];
  const last = x[n - 1];
  for (let i = 0; i < edge; i++) out[i] = 2 * first - x[edge - i];
  for (let i = 0; i < n; i++) out[edge + i] = x[i];
  for (let i = 0; i < edge; i++) out[edge + n + i] = 2 * last - x[n - 2 - i];
  return out;
}

/** scipy's default padlen for sosfiltfilt. */
export function defaultPadlen(sos: SOS): number {
  let ntaps = 2 * sos.length + 1;
  const zeroB2 = sos.filter((s) => s[2] === 0).length;
  const zeroA2 = sos.filter((s) => s[5] === 0).length;
  ntaps -= Math.min(zeroB2, zeroA2);
  return 3 * ntaps;
}

/** Zero-phase forward-backward SOS filtering (scipy.signal.sosfiltfilt, padtype='odd'). */
export function sosfiltfilt(sos: SOS, x: ArrayLike<number>, padlen?: number): Float64Array {
  const edge = padlen ?? defaultPadlen(sos);
  const ext = oddExt(x, edge);
  const zi = sosfiltZi(sos);

  const scaled = (v: number) => zi.map((z) => z * v);
  const fwd = sosfilt(sos, ext, scaled(ext[0])).y;

  const rev = new Float64Array(fwd.length);
  for (let i = 0; i < fwd.length; i++) rev[i] = fwd[fwd.length - 1 - i];
  const bwd = sosfilt(sos, rev, scaled(rev[0])).y;

  const n = x.length;
  const y = new Float64Array(n);
  // bwd is reversed; undo the reversal and drop the padding.
  for (let i = 0; i < n; i++) y[i] = bwd[bwd.length - 1 - (edge + i)];
  return y;
}
