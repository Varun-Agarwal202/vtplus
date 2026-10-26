import matplotlib
matplotlib.use("TkAgg")          # most stable on macOS; pip install tk if missing

import serial
import numpy as np
import time
import threading
import pandas as pd
from scipy.signal import butter, filtfilt, windows
from scipy.fft import rfft, rfftfreq
import matplotlib.pyplot as plt
from collections import deque
import pywt

# ── Config ────────────────────────────────────────────────────────────────────
PORT         = "/dev/cu.usbserial-A5069RR4"
BAUD         = 115200
FS           = 200
WINDOW       = 128
LOW          = 4
HIGH         = 12
PLOT_SECONDS = 30
MAX_POINTS   = 500
REDRAW_HZ    = 5          # plot refresh rate

# ── Serial open + flush ───────────────────────────────────────────────────────
ser = serial.Serial(PORT, BAUD, timeout=1)
time.sleep(3)
ser.reset_input_buffer()

print("Waiting for valid CSV from Arduino...")
deadline = time.time() + 5
while time.time() < deadline:
    line  = ser.readline().decode(errors="ignore").strip()
    parts = line.split(",")
    if len(parts) == 3:
        try:
            float(parts[0]); float(parts[1]); float(parts[2])
            print(f"First valid line: {line}")
            break
        except ValueError:
            pass
    elif line:
        print(f"  Skipping: {line!r}")

# ── DSP ───────────────────────────────────────────────────────────────────────
def butter_highpass(cutoff, fs, order=4):
    return butter(order, cutoff / (fs / 2), btype="high")

b_hp, a_hp = butter_highpass(2, FS)
freqs      = rfftfreq(WINDOW, 1 / FS)
band_mask  = (freqs >= LOW) & (freqs <= HIGH)

# ── Shared state ──────────────────────────────────────────────────────────────
buf        = []
data_log   = []
plot_times = deque(maxlen=MAX_POINTS)
plot_rms   = deque(maxlen=MAX_POINTS)
plot_freq  = deque(maxlen=MAX_POINTS)
plot_lock  = threading.Lock()
stop_event = threading.Event()
t0         = time.time()

# ── Serial worker thread ──────────────────────────────────────────────────────
def serial_worker():
    while not stop_event.is_set():
        try:
            line = ser.readline().decode(errors="ignore").strip()
        except Exception:
            break
        if not line:
            continue
        parts = line.split(",")
        if len(parts) != 3:
            continue
        try:
            ax = float(parts[0])
            ay = float(parts[1])
            az = float(parts[2])
        except ValueError:
            continue

        mag = np.sqrt(ax**2 + ay**2 + az**2)
        buf.append(mag)

        if len(buf) < WINDOW:
            continue

        data = np.array(buf)
        buf.clear()

        filtered  = filtfilt(b_hp, a_hp, data)
        rms       = np.sqrt(np.mean(filtered**2))

        windowed   = (data - np.mean(data)) * windows.hamming(WINDOW)
        spectrum   = np.abs(rfft(windowed))
        band_power = spectrum[band_mask]
        band_freqs = freqs[band_mask]

        total_bp = np.sum(band_power)
        if total_bp == 0:
            continue

        bp_norm       = band_power / total_bp
        entropy       = -np.sum(bp_norm * np.log(bp_norm + 1e-10))
        entropy      /= np.log(len(bp_norm))
        dominant_freq = band_freqs[np.argmax(band_power)]
        tremor_amp    = total_bp
        timestamp     = time.time() - t0

        print(f"Freq: {dominant_freq:.2f}  Entropy: {entropy:.3f}  RMS: {rms:.4f}")

        data_log.append({
            "time": timestamp, "frequency": dominant_freq,
            "entropy": entropy, "amplitude": tremor_amp, "rms": rms,
        })

        with plot_lock:
            plot_times.append(timestamp)
            plot_rms.append(tremor_amp)
            plot_freq.append(dominant_freq)

        pwm = (120 * (tremor_amp ** 10.485)) / (2.407**10.485 + tremor_amp**10.485)
        try:
            ser.write(("V" + str(pwm) + "\n").encode())
        except Exception:
            pass

        if len(data_log) % 20 == 0:
            pd.DataFrame(data_log).to_excel("test.xlsx", index=False)
            print("Saved to test.xlsx")

# ── Plot setup ────────────────────────────────────────────────────────────────
plt.ion()
fig, (ax_amp, ax_freq) = plt.subplots(2, 1, figsize=(12, 6), sharex=True,
                                       facecolor="#0d0d0d")
fig.suptitle("Closed-Loop Tremor Monitor — Live", color="white",
             fontsize=13, fontweight="bold")

for ax in (ax_amp, ax_freq):
    ax.set_facecolor("#111111")
    ax.tick_params(colors="white", labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor("#333333")

line_amp,  = ax_amp.plot([], [], color="#00cfff", linewidth=1.2, label="Tremor Amplitude")
ax_amp.set_ylabel("Band Power (a.u.)", color="white", fontsize=9)
ax_amp.legend(loc="upper left", fontsize=8, facecolor="#1a1a1a", labelcolor="white")
ax_amp.set_ylim(0, 1)

line_freq, = ax_freq.plot([], [], color="#ff6b6b", linewidth=1.2, label="Dominant Freq")
ax_freq.set_ylabel("Frequency (Hz)", color="white", fontsize=9)
ax_freq.set_xlabel("Time (s)", color="white", fontsize=9)
ax_freq.set_ylim(LOW - 0.5, HIGH + 0.5)
ax_freq.axhspan(LOW, HIGH, color="#ffffff", alpha=0.04, label="Tremor band (4–12 Hz)")
ax_freq.legend(loc="upper left", fontsize=8, facecolor="#1a1a1a", labelcolor="white")

plt.tight_layout()
plt.show(block=False)
fig.canvas.draw()
fig.canvas.flush_events()

# ── Main loop ─────────────────────────────────────────────────────────────────
worker = threading.Thread(target=serial_worker, daemon=True)
worker.start()
print("Recording… Close the plot window or press Ctrl+C to stop.")

interval = 1.0 / REDRAW_HZ
try:
    while plt.fignum_exists(fig.number):
        with plot_lock:
            if len(plot_times) >= 2:
                t_arr = np.array(plot_times)
                r_arr = np.array(plot_rms)
                f_arr = np.array(plot_freq)
            else:
                t_arr = None

        if t_arr is not None:
            t_now = t_arr[-1]
            t_min = max(t_arr[0], t_now - PLOT_SECONDS)
            mask  = t_arr >= t_min

            line_amp.set_data(t_arr[mask], r_arr[mask])
            ax_amp.set_xlim(t_min, t_now + 1)
            ax_amp.set_ylim(0, max(r_arr[mask].max() * 1.3, 0.01))

            line_freq.set_data(t_arr[mask], f_arr[mask])
            ax_freq.set_xlim(t_min, t_now + 1)

            fig.canvas.draw()
            fig.canvas.flush_events()

        time.sleep(interval)

except KeyboardInterrupt:
    pass

# ── Cleanup ───────────────────────────────────────────────────────────────────
print("\nStopping…")
stop_event.set()
worker.join(timeout=2)

try:
    ser.write(b"V0\n")
    ser.close()
except Exception:
    pass
print("Motor stopped. Serial closed.")

if data_log:
    df = pd.DataFrame(data_log)
    df.to_excel("filler.xlsx", index=False)
    print("Final data saved to filler.xlsx")

    rms_vals  = df["rms"].values
    n         = len(rms_vals)
    window_dt = WINDOW / FS
    times_arr = np.arange(n) * window_dt

    max_level = pywt.dwt_max_level(n, "db4")
    LEVELS    = min(4, max_level)
    print(f"Wavelet decomp: {LEVELS} levels over {n} windows")

    if LEVELS >= 1:
        coeffs = pywt.wavedec(rms_vals, "db4", level=LEVELS)
        reconstructed = []
        for i in range(len(coeffs)):
            zeroed    = [np.zeros_like(c) for c in coeffs]
            zeroed[i] = coeffs[i]
            rec = pywt.waverec(zeroed, "db4")
            rec = rec[:n] if len(rec) >= n else np.pad(rec, (0, n - len(rec)))
            reconstructed.append(rec)

        tremor_rec = np.sum(reconstructed[1:], axis=0)
        eff_fs     = 1.0 / window_dt

        def make_label(i, total):
            if i == 0:
                return f"Slow trend\n(0–{eff_fs/(2**total):.2f} Hz)"
            lo = eff_fs / (2 ** (total - i + 1))
            hi = eff_fs / (2 ** (total - i))
            return f"Detail d{i}\n({lo:.2f}–{hi:.2f} Hz)"

        colors  = ["dimgray", "steelblue", "tomato", "darkorange", "goldenrod"]
        n_plots = 1 + len(coeffs) + 1
        plt.ioff()
        fig2, axes = plt.subplots(n_plots, 1, figsize=(12, 2.2 * n_plots), sharex=True)
        axes[0].plot(times_arr, rms_vals, color="dimgray", linewidth=0.8)
        axes[0].set_ylabel("RMS (a.u.)", fontsize=8)
        axes[0].set_title("db4 Wavelet Decomposition — Post Session", fontsize=11)

        for i, (rec, col) in enumerate(zip(reconstructed, colors)):
            axes[i+1].plot(times_arr, rec, color=col, linewidth=0.8)
            axes[i+1].set_ylabel(make_label(i, LEVELS), fontsize=7)
            axes[i+1].axhline(0, color="gray", linewidth=0.4, linestyle="--")

        axes[-1].plot(times_arr, rms_vals, color="lightgray", linewidth=0.7, label="Original")
        axes[-1].plot(times_arr, tremor_rec, color="steelblue", linewidth=1.0, label="Filtered tremor")
        axes[-1].set_ylabel("Reconstructed\ntremor (a.u.)", fontsize=8)
        axes[-1].axhline(0, color="gray", linewidth=0.4, linestyle="--")
        axes[-1].legend(fontsize=7, loc="upper right")
        axes[-1].set_xlabel("Time (s)", fontsize=9)

        plt.tight_layout()
        plt.savefig("tremor_wavelet.png", dpi=150)
        print("Wavelet plot saved to tremor_wavelet.png")
        plt.show()