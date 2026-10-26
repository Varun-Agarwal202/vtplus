#!/usr/bin/env python3
"""
Generate cross-implementation test fixtures from the reference Python pipeline.

    python3 scripts/make_fixtures.py

Writes src/dsp/__tests__/fixtures/reference.json and two Phyphox-style CSVs.
The Jest suite regenerates the same synthetic inputs in TypeScript (portable
mulberry32 PRNG + Box-Muller) and checks that the TS pipeline reproduces the
numbers from `reference/tremor_analyze.py` / scipy.
"""
import json
import math
import os
import sys

import numpy as np
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "reference"))
import tremor_analyze as ta  # noqa: E402

OUT_DIR = os.path.join(ROOT, "src", "dsp", "__tests__", "fixtures")
os.makedirs(OUT_DIR, exist_ok=True)

M32 = 0xFFFFFFFF


def mulberry32(seed):
    """Same sequence as the JS implementation in src/dsp/__tests__/synth.ts."""
    state = [seed & M32]

    def rnd():
        state[0] = (state[0] + 0x6D2B79F5) & M32
        a = state[0]
        t = ((a ^ (a >> 15)) * (a | 1)) & M32
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & M32)) ^ t) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296.0

    return rnd


def make_normal(rnd):
    def normal():
        u1 = 1.0 - rnd()
        u2 = rnd()
        return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)

    return normal


def synth_portable(freq, amp, dur=30.0, fs_raw=60.0, noise=0.02, seed=1, gravity=9.81):
    """Mirror of tremor_analyze.synth() with a portable RNG. Units: m/s^2."""
    rnd = mulberry32(seed)
    normal = make_normal(rnd)
    n = int(dur * fs_raw)
    dts = [1.0 / fs_raw + 0.002 * normal() for _ in range(n)]
    t = np.cumsum(np.array(dts))
    nx = np.array([normal() for _ in range(n)])
    ny = np.array([normal() for _ in range(n)])
    nz = np.array([normal() for _ in range(n)])
    s = amp * np.sin(2 * np.pi * freq * t)
    x = 0.3 * s + noise * nx
    y = 0.5 * s + noise * ny
    z = gravity + 0.8 * s + noise * nz
    return t, np.column_stack([x, y, z])


def expected_from(r):
    return {
        "raw_fs": float(r["raw_fs"]),
        "duration_s": float(r["duration_s"]),
        "dominant_hz": float(r["dominant_hz"]),
        "band_power": float(r["band_power"]),
        "rms": float(r["rms_ms2"]),
        "peak_ratio": float(r["peak_ratio"]),
        "warnings": list(r["warnings"]),
    }


def main():
    out = {"generated_by": "scripts/make_fixtures.py", "synthetic": [], "filters": [], "welch": None, "csv": []}

    # --- 1. Synthetic cases from the brief (plus a noise-floor case) --------
    cases = [(f, a) for f in (4.5, 6.0, 8.0, 10.0) for a in (0.05, 0.2, 0.8)] + [(6.0, 0.0)]
    seed = 1
    for freq, amp in cases:
        t, xyz = synth_portable(freq, amp, seed=seed)
        r = ta.analyze(t, xyz)
        out["synthetic"].append(
            {
                "name": f"{freq}Hz_{amp}",
                "freq": freq,
                "amp": amp,
                "dur": 30.0,
                "fs_raw": 60.0,
                "noise": 0.02,
                "seed": seed,
                "expected": expected_from(r),
            }
        )
        seed += 1

    # A faster, less jittery "phone-like" case at 100 Hz and in g
    t, xyz = synth_portable(7.0, 0.3, fs_raw=100.0, seed=seed)
    r = ta.analyze(t, xyz)
    out["synthetic"].append(
        {"name": "7Hz_0.3_100Hz", "freq": 7.0, "amp": 0.3, "dur": 30.0, "fs_raw": 100.0, "noise": 0.02, "seed": seed,
         "expected": expected_from(r)}
    )

    # --- 2. Filter fixtures (sosfilt + sosfiltfilt on a fixed random signal) ---
    rng = np.random.default_rng(42)
    fs = 100.0
    xin = rng.standard_normal(600)
    xin[:] += np.sin(2 * np.pi * 6 * np.arange(600) / fs) + 0.5
    for name, order, cutoff, btype in [
        ("hp1", 4, 1.0, "highpass"),
        ("bp4_12", 4, [4.0, 12.0], "bandpass"),
        ("lp20", 4, 20.0, "lowpass"),
        ("hp2_order2", 2, 2.0, "highpass"),
    ]:
        sos = signal.butter(order, cutoff, btype, fs=fs, output="sos")
        y_ff = signal.sosfiltfilt(sos, xin)
        y_f = signal.sosfilt(sos, xin)
        w, h = signal.sosfreqz(sos, worN=[0.5, 1.0, 2.0, 4.0, 8.0, 12.0, 20.0, 40.0], fs=fs)
        out["filters"].append(
            {
                "name": name,
                "order": order,
                "cutoff": cutoff,
                "type": btype,
                "fs": fs,
                "input": xin.tolist(),
                "sosfiltfilt": y_ff.tolist(),
                "sosfilt": y_f.tolist(),
                "freqz_hz": list(w),
                "freqz_mag": np.abs(h).tolist(),
            }
        )

    # --- 3. Welch fixture ---------------------------------------------------
    n = 2600
    tt = np.arange(n) / fs
    xw = 0.4 * np.sin(2 * np.pi * 6.3 * tt) + 0.1 * np.sin(2 * np.pi * 11 * tt) + 0.05 * rng.standard_normal(n) + 0.2
    f, p = signal.welch(xw, fs=fs, nperseg=400, noverlap=200)
    out["welch"] = {"fs": fs, "nperseg": 400, "noverlap": 200, "input": xw.tolist(), "f": f.tolist(), "psd": p.tolist()}

    # --- 4. CSV fixtures (Phyphox layout, run through load() + analyze()) ----
    for freq, amp, fname in [(6.0, 0.2, "synth_6hz_0.2.csv"), (10.0, 0.05, "synth_10hz_0.05.csv")]:
        t, xyz = ta.synth(freq, amp)  # the original numpy-RNG generator
        path = os.path.join(OUT_DIR, fname)
        with open(path, "w") as fh:
            fh.write('"Time (s)","Acceleration x (m/s^2)","Acceleration y (m/s^2)","Acceleration z (m/s^2)"\n')
            for ti, (x, y, z) in zip(t, xyz):
                fh.write(f"{ti:.6f},{x:.6f},{y:.6f},{z:.6f}\n")
        t2, xyz2 = ta.load(path)
        r = ta.analyze(t2, xyz2)
        out["csv"].append({"file": fname, "freq": freq, "amp": amp, "expected": expected_from(r)})

    with open(os.path.join(OUT_DIR, "reference.json"), "w") as fh:
        json.dump(out, fh)
    print(f"wrote {os.path.join(OUT_DIR, 'reference.json')}")
    for c in out["synthetic"]:
        e = c["expected"]
        print(f"  {c['name']:>16}: dominant {e['dominant_hz']:.2f} Hz  rms {e['rms']:.5f}  peak_ratio {e['peak_ratio']:.3f}  {e['warnings']}")


if __name__ == "__main__":
    main()
