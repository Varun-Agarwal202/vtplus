/**
 * Welch power spectral density, matching scipy.signal.welch defaults:
 *   window='hann' (periodic), detrend='constant', scaling='density',
 *   return_onesided=True, average='mean', nfft=nperseg.
 */
import { rfft, rfftfreq } from './fft';

export interface WelchResult {
  f: Float64Array;
  psd: Float64Array;
  segments: number;
}

/** Periodic Hann window (scipy.signal.get_window('hann', N) -> sym=False). */
export function hannPeriodic(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export function welch(x: ArrayLike<number>, fs: number, nperseg: number, noverlap?: number): WelchResult {
  const n = x.length;
  if (nperseg > n) {
    throw new Error(`welch: nperseg (${nperseg}) is greater than input length (${n})`);
  }
  const nov = noverlap ?? Math.floor(nperseg / 2);
  const step = nperseg - nov;
  if (step <= 0) throw new Error('welch: noverlap must be less than nperseg');
  const nSeg = Math.floor((n - nov) / step);

  const win = hannPeriodic(nperseg);
  let winSq = 0;
  for (let i = 0; i < nperseg; i++) winSq += win[i] * win[i];
  const scale = 1 / (fs * winSq);

  const nBins = Math.floor(nperseg / 2) + 1;
  const acc = new Float64Array(nBins);
  const seg = new Float64Array(nperseg);

  for (let s = 0; s < nSeg; s++) {
    const start = s * step;
    let mean = 0;
    for (let i = 0; i < nperseg; i++) mean += x[start + i];
    mean /= nperseg;
    for (let i = 0; i < nperseg; i++) seg[i] = (x[start + i] - mean) * win[i];
    const { re, im } = rfft(seg);
    for (let k = 0; k < nBins; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }

  const psd = new Float64Array(nBins);
  const lastIsNyquist = nperseg % 2 === 0;
  for (let k = 0; k < nBins; k++) {
    let v = (acc[k] / nSeg) * scale;
    const isEdge = k === 0 || (lastIsNyquist && k === nBins - 1);
    if (!isEdge) v *= 2;
    psd[k] = v;
  }
  return { f: rfftfreq(nperseg, fs), psd, segments: nSeg };
}

/** Trapezoidal integral of y(x) over the given index range [lo, hi] inclusive. */
export function trapezoid(y: ArrayLike<number>, x: ArrayLike<number>, lo = 0, hi = y.length - 1): number {
  let acc = 0;
  for (let i = lo; i < hi; i++) acc += ((y[i] + y[i + 1]) / 2) * (x[i + 1] - x[i]);
  return acc;
}
