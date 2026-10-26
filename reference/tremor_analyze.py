"""
Phone-accelerometer tremor analysis (validation prototype).

Usage:
  python tremor_analyze.py recording.csv        # Phyphox export: time, x, y, z
  python tremor_analyze.py --synth              # self-test on synthetic shakes

Pipeline: resample to uniform fs -> trim ends -> 1 Hz high-pass (kills gravity/drift)
-> Welch PSD summed over 3 axes -> dominant freq + band power in 4-12 Hz
-> band-passed RMS amplitude -> quality checks.
"""
import sys
import numpy as np
import pandas as pd
from scipy import signal
from scipy.integrate import trapezoid

BAND = (4.0, 12.0)   # tremor band (Hz)
FS = 100.0           # analysis sample rate (Hz)
TRIM_S = 2.0         # drop first/last seconds (hand settling)


def load(path):
    df = pd.read_csv(path)
    t = df.iloc[:, 0].to_numpy(float)
    xyz = df.iloc[:, 1:4].to_numpy(float)
    return t, xyz


def analyze(t, xyz, fs=FS):
    t = t - t[0]
    raw_fs = (len(t) - 1) / t[-1]
    jitter = np.std(np.diff(t)) / np.mean(np.diff(t))

    # uniform resample (phone timestamps are irregular)
    tu = np.arange(0, t[-1], 1 / fs)
    x = np.column_stack([np.interp(tu, t, xyz[:, i]) for i in range(3)])
    n = int(TRIM_S * fs)
    x = x[n:-n]
    duration = len(x) / fs

    # remove gravity + slow drift
    hp = signal.butter(4, 1.0, "highpass", fs=fs, output="sos")
    x = signal.sosfiltfilt(hp, x, axis=0)

    # PSD summed across axes (orientation-independent)
    nper = int(4 * fs)
    f, _ = signal.welch(x[:, 0], fs=fs, nperseg=nper)
    psd = sum(signal.welch(x[:, i], fs=fs, nperseg=nper, noverlap=nper // 2)[1] for i in range(3))
    band = (f >= BAND[0]) & (f <= BAND[1])
    dom = f[band][np.argmax(psd[band])]
    band_power = trapezoid(psd[band], f[band])
    wide = (f >= 1) & (f <= 20)
    peak = (f >= dom - 1) & (f <= dom + 1)
    peak_ratio = trapezoid(psd[peak], f[peak]) / trapezoid(psd[wide], f[wide])

    # band-passed RMS amplitude (m/s^2), all axes combined
    bp = signal.butter(4, BAND, "bandpass", fs=fs, output="sos")
    xb = signal.sosfiltfilt(bp, x, axis=0)
    rms = np.sqrt(np.mean(np.sum(xb**2, axis=1)))

    warnings = []
    if raw_fs < 50: warnings.append(f"low sample rate ({raw_fs:.0f} Hz)")
    if jitter > 0.5: warnings.append(f"irregular timestamps (jitter {jitter:.2f})")
    if duration < 20: warnings.append(f"short recording ({duration:.0f}s after trim)")
    if peak_ratio < 0.15: warnings.append("no clear spectral peak (weak/noisy tremor)")

    return dict(raw_fs=raw_fs, duration_s=duration, dominant_hz=dom,
                band_power=band_power, rms_ms2=rms, peak_ratio=peak_ratio,
                warnings=warnings)


def synth(freq, amp, dur=30, fs_raw=60, noise=0.02, seed=0):
    rng = np.random.default_rng(seed)
    t = np.cumsum(rng.normal(1 / fs_raw, 0.002, int(dur * fs_raw)))  # jittery timestamps
    s = amp * np.sin(2 * np.pi * freq * t)
    x = 0.3 * s + noise * rng.standard_normal(len(t))
    y = 0.5 * s + noise * rng.standard_normal(len(t))
    z = 9.81 + 0.8 * s + noise * rng.standard_normal(len(t))   # gravity on z
    return t, np.column_stack([x, y, z])


def report(r):
    print(f"  fs {r['raw_fs']:.0f} Hz | {r['duration_s']:.0f}s | dominant {r['dominant_hz']:.2f} Hz | "
          f"RMS {r['rms_ms2']:.4f} m/s^2 | peak ratio {r['peak_ratio']:.2f}")
    for w in r["warnings"]:
        print("  WARNING:", w)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--synth":
        for f_true in (4.5, 6.0, 8.0, 10.0):
            for a in (0.05, 0.2, 0.8):
                r = analyze(*synth(f_true, a))
                print(f"true {f_true} Hz, amp {a}:", end="")
                report(r)
    else:
        report(analyze(*load(sys.argv[1])))
