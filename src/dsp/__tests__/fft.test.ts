import { fft, rfft, rfftfreq } from '../fft';
import { mulberry32 } from './synth';

function naiveDft(re: number[], im: number[]) {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const ang = (-2 * Math.PI * k * t) / n;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      sr += re[t] * c - im[t] * s;
      si += re[t] * s + im[t] * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}

describe('fft', () => {
  const rnd = mulberry32(7);

  test.each([1, 2, 4, 7, 16, 25, 100, 256, 400, 1000])('matches a naive DFT for n=%i', (n) => {
    const re = Array.from({ length: n }, () => rnd() * 2 - 1);
    const im = Array.from({ length: n }, () => rnd() * 2 - 1);
    const a = fft(re, im);
    const b = naiveDft(re, im);
    const scale = Math.sqrt(n);
    for (let k = 0; k < n; k++) {
      expect(Math.abs(a.re[k] - b.re[k])).toBeLessThan(1e-9 * scale);
      expect(Math.abs(a.im[k] - b.im[k])).toBeLessThan(1e-9 * scale);
    }
  });

  test('inverse undoes forward (n=400, Bluestein path)', () => {
    const n = 400;
    const re = Array.from({ length: n }, () => rnd());
    const fwd = fft(re);
    const back = fft(fwd.re, fwd.im, true);
    for (let i = 0; i < n; i++) {
      expect(back.re[i]).toBeCloseTo(re[i], 10);
      expect(Math.abs(back.im[i])).toBeLessThan(1e-10);
    }
  });

  test('rfft of a sinusoid peaks at the right bin and has N/2+1 bins', () => {
    const n = 400;
    const fs = 100;
    const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 6 * i) / fs));
    const { re, im } = rfft(x);
    expect(re.length).toBe(n / 2 + 1);
    const f = rfftfreq(n, fs);
    let best = 0;
    for (let k = 1; k < re.length; k++) {
      if (re[k] ** 2 + im[k] ** 2 > re[best] ** 2 + im[best] ** 2) best = k;
    }
    expect(f[best]).toBe(6);
  });

  test('rfft zero-pads when nfft > length', () => {
    const { re } = rfft([1, 2, 3], 8);
    expect(re.length).toBe(5);
    expect(re[0]).toBeCloseTo(6, 12);
  });
});
