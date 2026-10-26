/**
 * FFT utilities. Pure TypeScript, no dependencies.
 *
 * - `fftRadix2`: in-place iterative Cooley-Tukey for power-of-two lengths.
 * - `fft`: arbitrary length via Bluestein's chirp-z algorithm (falls back to
 *   radix-2 when the length is already a power of two).
 * - `rfft`: real-input FFT returning the one-sided spectrum (N/2 + 1 bins),
 *   with the same bin layout as `numpy.fft.rfft`.
 *
 * Bluestein lets us match scipy's Welch output exactly: scipy uses
 * nfft = nperseg (e.g. 400 at 100 Hz) which is not a power of two.
 */

export interface Complex {
  re: Float64Array;
  im: Float64Array;
}

export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place radix-2 FFT. `re.length` must be a power of two. */
export function fftRadix2(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n <= 1) return;
  if (!isPowerOfTwo(n)) throw new Error(`fftRadix2: length ${n} is not a power of two`);

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }

  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cRe = 1;
      let cIm = 0;
      for (let k = 0; k < half; k++) {
        const aIdx = i + k;
        const bIdx = aIdx + half;
        const tRe = re[bIdx] * cRe - im[bIdx] * cIm;
        const tIm = re[bIdx] * cIm + im[bIdx] * cRe;
        re[bIdx] = re[aIdx] - tRe;
        im[bIdx] = im[aIdx] - tIm;
        re[aIdx] += tRe;
        im[aIdx] += tIm;
        const nRe = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = nRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/**
 * FFT of arbitrary length. Returns new arrays; inputs are not modified.
 * Uses Bluestein's algorithm for non-power-of-two lengths.
 */
export function fft(inRe: ArrayLike<number>, inIm?: ArrayLike<number>, inverse = false): Complex {
  const n = inRe.length;
  const re = Float64Array.from(inRe);
  const im = inIm ? Float64Array.from(inIm) : new Float64Array(n);

  if (isPowerOfTwo(n)) {
    fftRadix2(re, im, inverse);
    return { re, im };
  }

  // Bluestein: X[k] = conj(w[k]) * sum_n (x[n]*conj(w[n])) * w[k-n],  w[m] = exp(i*pi*m^2/n)
  const m = nextPowerOfTwo(2 * n - 1);
  const sign = inverse ? 1 : -1;
  const wRe = new Float64Array(n);
  const wIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    // Reduce k^2 mod 2n to keep the angle argument small and accurate.
    const kk = (k * k) % (2 * n);
    const ang = (sign * Math.PI * kk) / n;
    wRe[k] = Math.cos(ang);
    wIm[k] = Math.sin(ang);
  }

  const aRe = new Float64Array(m);
  const aIm = new Float64Array(m);
  for (let k = 0; k < n; k++) {
    // a[k] = x[k] * w[k]   (w already carries the sign)
    aRe[k] = re[k] * wRe[k] - im[k] * wIm[k];
    aIm[k] = re[k] * wIm[k] + im[k] * wRe[k];
  }

  const bRe = new Float64Array(m);
  const bIm = new Float64Array(m);
  // b[k] = conj(w[k]) for k in (-n, n), wrapped into [0, m)
  bRe[0] = wRe[0];
  bIm[0] = -wIm[0];
  for (let k = 1; k < n; k++) {
    bRe[k] = wRe[k];
    bIm[k] = -wIm[k];
    bRe[m - k] = wRe[k];
    bIm[m - k] = -wIm[k];
  }

  fftRadix2(aRe, aIm);
  fftRadix2(bRe, bIm);
  for (let k = 0; k < m; k++) {
    const r = aRe[k] * bRe[k] - aIm[k] * bIm[k];
    const i = aRe[k] * bIm[k] + aIm[k] * bRe[k];
    aRe[k] = r;
    aIm[k] = i;
  }
  fftRadix2(aRe, aIm, true);

  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    // X[k] = w[k] * c[k]
    outRe[k] = aRe[k] * wRe[k] - aIm[k] * wIm[k];
    outIm[k] = aRe[k] * wIm[k] + aIm[k] * wRe[k];
  }
  if (inverse) {
    for (let k = 0; k < n; k++) {
      outRe[k] /= n;
      outIm[k] /= n;
    }
  }
  return { re: outRe, im: outIm };
}

/**
 * Real FFT: one-sided spectrum with floor(N/2)+1 bins, like numpy.fft.rfft.
 * If `nfft` > x.length the input is zero-padded.
 */
export function rfft(x: ArrayLike<number>, nfft?: number): Complex {
  const n = nfft ?? x.length;
  const padded = new Float64Array(n);
  const copyLen = Math.min(n, x.length);
  for (let i = 0; i < copyLen; i++) padded[i] = x[i];
  const full = fft(padded);
  const half = Math.floor(n / 2) + 1;
  return { re: full.re.slice(0, half), im: full.im.slice(0, half) };
}

/** Frequencies for the rfft bins: k * fs / n, like numpy.fft.rfftfreq. */
export function rfftfreq(n: number, fs: number): Float64Array {
  const half = Math.floor(n / 2) + 1;
  const f = new Float64Array(half);
  for (let k = 0; k < half; k++) f[k] = (k * fs) / n;
  return f;
}
