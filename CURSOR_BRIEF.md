# Tremor Tracker App: Project Brief for Cursor

Read this whole file before writing code. It is the source of truth for scope, architecture, and the signal-processing spec.

## 1. What this is

A standalone phone app (React Native + Expo) that **measures hand tremor objectively using the phone's accelerometer** and tracks it over time. It is a spin-off of **VibroTremor+**, a wrist-worn closed-loop tremor-suppression device I built (Arduino + IMU, vibrotactile motor, Python DSP, Hill-equation drive curve, db4 wavelet analysis, XGBoost stress classifier). The app is **not** part of the paper or the device; it is its own project.

**Pitch:** people with tremor see a doctor a few times a year and have almost no objective data between visits. This app turns a 30-second phone recording into a tremor frequency and amplitude, logs it, and shows trends plus a clean summary for a clinician.

**This is NOT:** a diagnostic tool, a dosing tool, or medical advice. See section 9.

## 2. Stack

- React Native with **Expo** (managed workflow, run in Expo Go for the MVP), TypeScript
- `expo-sensors` (Accelerometer) for data
- `expo-sqlite` for local storage (local-first, no backend, no accounts)
- `expo-router` for navigation
- Charts: `react-native-svg` based (e.g. victory-native or a small custom chart); keep it light
- `expo-sharing` / `expo-print` (or similar) for exporting a summary
- Jest for DSP unit tests
- Platform targets: iOS and Android. I will test on my own phone via Expo Go.
- A custom dev build is only needed later for Bluetooth to the VibroTremor+ band (stretch goal).

## 3. Reference implementations (ground truth)

1. **`tremor_analyze.py`** (Python, in this project): the validation prototype. Resamples to 100 Hz, trims 2 s from each end, 1 Hz high-pass, Welch PSD summed across 3 axes, dominant frequency in 4-12 Hz, band-passed RMS, peak ratio, quality warnings. **The JS implementation must match its outputs on the same input** (tolerances in section 8).
2. **The original VibroTremor Python script** (serial from Arduino, 200 Hz). Key facts about it, since the app should stay consistent with it where it makes sense:
   - Sampling rate FS = 200 Hz, window = 128 samples (0.64 s), non-overlapping
   - Signal = vector magnitude of ax, ay, az
   - Tremor band = 4-12 Hz
   - RMS: 2 Hz Butterworth high-pass (order 4, filtfilt) on the magnitude, then RMS
   - Dominant frequency: mean-removed + Hamming-windowed magnitude, `rfft`, argmax of |FFT| in 4-12 Hz
   - "Tremor amplitude" = **sum of |FFT| over the 4-12 Hz bins** (unnormalized, arbitrary units)
   - Normalized spectral entropy over the band: `-sum(p*log(p))/log(N)` where `p = band_power/sum(band_power)`
   - Motor drive (hardware only, **not needed in the app**): `pwm = 120 * A^10.485 / (2.407^10.485 + A^10.485)`, a Hill-shaped curve mapping amplitude to PWM
   - Post-session: db4 wavelet decomposition (up to 4 levels) of the **sequence of per-window RMS values** (not the raw signal) to separate slow trend from faster fluctuation. Effective sample rate of that sequence is 1/0.64 = 1.56 Hz.
   - The XGBoost stress classifier is **not** in that script.

## 4. Important differences between the device and a phone (design for these)

1. **Units.** `expo-sensors` Accelerometer reports in **g**, not m/s². `tremor_analyze.py` and Phyphox use m/s². Pick one internal unit (g), store it, and convert for display (1 g = 9.80665 m/s²). Never compare amplitudes to the device's "a.u." numbers or the 2.407 Hill constant; those depend on the Arduino IMU's scaling.
2. **Sample rate is not guaranteed.** Request a fast update interval (`Accelerometer.setUpdateInterval(10)`, i.e. ~100 Hz) but treat the actual rate as unknown and variable. Timestamp each sample on receipt (check the current expo-sensors docs for whether a native timestamp is provided), then **resample to a uniform grid** before any DSP (linear interpolation is fine). Record the measured rate with every session.
3. **Frequency resolution.** The device's 128-sample window at 200 Hz gives ~1.56 Hz bins, which is coarse. For the phone use **longer windows in seconds, not samples**: Welch with 4 s segments, 50% overlap (0.25 Hz bins) for the session result. For any live display, use ~2 s windows with zero-padding to a power of two.
4. **Orientation is unknown.** The device sat on the wrist in a fixed orientation. A phone is held in any orientation. Remove gravity with a high-pass filter (1 Hz) and **sum the PSD across the three axes** (as `tremor_analyze.py` does) so results don't depend on orientation. Optionally offer a "device parity" mode that uses vector magnitude like the original, but per-axis is the default.
5. **Hand placement matters.** Measurement positions: **rest** (phone resting in the palm of a supported hand), **postural** (arm outstretched holding the phone), optionally **kinetic**. Store the position with each session and only compare like with like in trend charts.

## 5. Signal-processing spec (implement in pure TypeScript, no network)

Input: array of `{t_seconds, x, y, z}` in g, for a recording of 30 s (configurable).

1. Compute measured sample rate and timestamp jitter (std of dt / mean of dt).
2. Resample each axis to a uniform **100 Hz** grid by linear interpolation.
3. Trim **2 s** from the start and end (hand settling, button taps).
4. **High-pass 1 Hz**, 4th-order Butterworth, zero-phase (forward-backward) per axis. Implement the biquad/SOS design directly or use a small, well-maintained library; verify against `scipy.signal.butter(..., output="sos")` + `sosfiltfilt`.
5. **Welch PSD** per axis (4 s Hann segments, 50% overlap), summed across axes.
6. Metrics:
   - `dominant_hz`: argmax of PSD within 4-12 Hz (optional: parabolic interpolation around the peak)
   - `band_power`: integral of PSD over 4-12 Hz
   - `peak_ratio`: power within ±1 Hz of the peak divided by total power 1-20 Hz (how "tremor-like" the spectrum is)
   - `rms_g`: RMS of the 4-12 Hz band-passed signal (4th-order Butterworth, zero-phase), all three axes combined: `sqrt(mean(sum_over_axes(xb^2)))`
   - `spectral_entropy`: normalized, over the 4-12 Hz PSD bins (same formula as the device)
7. **Quality gates** (each produces a user-visible warning; hard-fail only on the first two):
   - measured rate < 50 Hz → fail ("sensor too slow")
   - usable duration < 20 s after trim → fail
   - jitter > 0.5 → warn
   - `peak_ratio` < 0.15 → warn ("no clear tremor peak; result may be noise")
   - excessive low-frequency motion (large energy 0-1 Hz before the high-pass, i.e. the phone was moving around) → warn
8. Optional, later: post-session db4 wavelet analysis of the per-window RMS sequence, like the original. Only add it if a maintained JS wavelet package exists or it's simple to implement; the MVP does not need it.

A **severity score (0-100)** is deliberately deferred. It needs calibration against known recordings, and I will not present uncalibrated numbers as clinical. For the MVP, report the raw metrics (frequency, RMS, band power, peak ratio) and a clearly labeled relative trend.

## 6. Features

### MVP
1. **First-launch disclaimer** screen (section 9), must be accepted once.
2. **Measure screen:**
   - Pick position (rest / postural), short instructions with an illustration or text
   - 3-second countdown, then a 30 s guided recording with a progress ring and a lightweight live waveform
   - Keep the screen awake during recording; abort cleanly if the app is backgrounded
3. **Result screen:** dominant frequency, RMS, peak ratio, quality warnings, a small spectrum plot with the 4-12 Hz band shaded. Save / discard.
4. **Optional context tags** per session (all self-reported, all optional): time is automatic; sleep (poor/ok/good), stress (1-5), caffeine (yes/no), "took my medication" (yes/no + time, entered by the user). **The app never suggests, calculates, or comments on medication doses.**
5. **History:** list of sessions + a trend chart of RMS and dominant frequency over time, filterable by position and date range.
6. **Session detail** with all metrics and tags; delete a session.
7. **Settings:** units (g vs m/s²), delete all data, dev mode toggle.
8. **Dev mode: export raw CSV** of the unprocessed samples in the same column layout as a Phyphox export (`Time (s), x, y, z`), so the same file can be run through `tremor_analyze.py` for validation.

### Next
- Clinician summary export (PDF or CSV): date range, trend chart, mean/median metrics per position, tags, and a plain statement that it is a self-tracked, non-diagnostic summary
- Correlation view (tremor vs. self-reported stress/sleep/caffeine)
- Educational "how drug effects rise and fall over time" curve: **general, generic, non-personalized, clearly labeled**; no dosing
- Stress classifier on-device, only if its input features can honestly come from a phone (the XGBoost model was trained on the device's sensors, so this is a separate research question; skip until the signal side is solid)

### Stretch
- Bluetooth link to the VibroTremor+ band (needs a dev build, not Expo Go)
- Apple Watch / Wear OS capture

## 7. Data model (SQLite)

`sessions`: `id`, `started_at` (ISO), `duration_s`, `position` (rest|postural|kinetic), `measured_fs_hz`, `jitter`, `dominant_hz`, `band_power`, `rms_g`, `peak_ratio`, `spectral_entropy`, `quality_flags` (JSON array), `sleep`, `stress`, `caffeine`, `meds_taken`, `meds_time`, `notes`, `device_model`, `app_version`.

Raw samples are **not** stored by default. In dev mode, optionally save the raw recording to a file for export. Include a schema version and simple migrations.

## 8. Testing and validation (required, not optional)

1. **DSP unit tests (Jest)** using synthetic signals: sinusoid at 4.5, 6, 8, 10 Hz with amplitudes 0.05 / 0.2 / 0.8 (m/s² or equivalent in g), gravity on z, jittery timestamps, small noise. Expect `dominant_hz` within ±0.25 Hz, RMS monotonic with amplitude. `tremor_analyze.py --synth` produces the matching reference numbers.
2. **Cross-implementation test:** the same recorded CSV through `tremor_analyze.py` and through the TS pipeline; expect `dominant_hz` within 0.25 Hz and RMS within ~10% (after unit conversion).
3. **Field check with a metronome:** shake the phone at a known rate (metronome app) in rest and postural positions; confirm the reported frequency matches. Also record the phone resting on a table (noise floor: low RMS, low peak ratio).
4. **Sensor variability:** repeat on a second phone if possible and note differences.
5. Eventually compare against VibroTremor+ band recordings of the same motion.

Quality rule for the whole project: do not claim accuracy numbers that haven't been measured.

## 9. Safety, privacy, and wording rules

- Explicit in the app: "This app tracks movement and is not a medical device. It does not diagnose or treat any condition and does not provide medical advice. Talk to your doctor about your symptoms and medications."
- **No medication dosing suggestions or calculations of any kind.** Medication fields are user-entered log data only.
- Local-first: all data stays on the device. No analytics SDKs, no accounts, no uploads. Provide "delete all data."
- Exported summaries are labeled as self-tracked and non-diagnostic.
- Don't describe results as "tremor severity" or "improvement" in a clinical sense. Use neutral wording ("amplitude," "dominant frequency," "change since last session").

## 10. Suggested build order

1. Scaffold Expo + TypeScript + expo-router; confirm it runs in Expo Go on my phone
2. Sensor capture module: collect timestamped samples at the requested rate; log the real measured rate
3. DSP module as a pure, dependency-light TS library with Jest tests (section 8.1 first)
4. Measure screen + Result screen wired to the DSP module
5. SQLite storage + History + trend chart
6. Dev-mode raw CSV export, then the cross-implementation test against `tremor_analyze.py`
7. Context tags, settings, disclaimer, polish
8. Clinician summary export

## 11. Open questions (ask me; don't assume)

- iPhone or Android (affects sensor quirks and sharing flow)?
- App name and visual style (clean/clinical vs. bold)
- Whether to offer the device-parity "magnitude" mode in addition to per-axis
- Whether the VibroTremor+ band recordings are available for validation
- Anything in this brief that conflicts with a library's actual behavior: tell me instead of silently working around it
