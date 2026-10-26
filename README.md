# Tremor Tracker

A standalone React Native + Expo app that measures hand tremor with the phone's accelerometer and tracks it over time. Spin-off of the VibroTremor+ project; see `CURSOR_BRIEF.md` for the full spec and `reference/tremor_analyze.py` for the signal-processing ground truth.

Not a medical device. It does not diagnose or treat anything and gives no medical advice.

## Run it

```bash
npm install
cp .env.example .env    # add your Supabase URL + anon key (see below)
npx expo start          # scan the QR code with Expo Go (iOS or Android)
```

### Publish the web version on Netlify

This project is ready for a static Netlify deployment. Import the GitHub repository in Netlify, then keep the detected settings or use:

```text
Build command: npm run build:web
Publish directory: dist
```

Add these environment variables in **Site configuration → Environment variables** before deploying:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Those two values are browser-visible configuration, not server secrets. Do not add the Supabase service-role key or an AI-provider key to Netlify. On a phone browser, the first reading asks for motion permission directly from the Start button.

### Account & cloud database

The app requires sign-in. [Supabase](https://supabase.com) is the backend: Postgres for session rows, Auth for email and Google sign-in, and Row Level Security so each user only sees their own data. The phone also keeps a SQLite cache, so measuring and history still work offline; changes upload when the app is online.

**Why Supabase (not Firebase)?** Readings are structured rows you filter by date/position/mode — that’s SQL. Expo Go can use the Supabase JS client without a custom native build. Firebase would win if we needed Firestore’s built-in offline SDK; we implemented that ourselves with SQLite instead.

1. Create a Supabase project.
2. In the SQL editor, run `supabase/schema.sql` (safe to re-run).
3. **Authentication → Providers** — enable **Email** (for testing, you can turn off “Confirm email”). For **Google**, create a *Web application* OAuth client in Google Cloud with redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, then paste its client ID and secret into Supabase. Under **Authentication → URL Configuration → Redirect URLs**, add `exp://**` and `tremortracker://auth/callback`.
4. Copy **Project URL** and the **publishable** key into `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
5. Restart Expo after changing env vars.

Dev-mode raw CSV files stay on the phone’s file system and are not uploaded.

Everything used here is bundled in Expo Go (sensors, SQLite, file system, sharing, print, keep-awake, haptics). No dev build is needed until the Bluetooth stretch goal.

```bash
npm test                # Jest: DSP + export + helpers (91 tests)
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint
npm run fixtures        # regenerate the scipy reference fixtures (needs python3 + numpy/scipy/pandas)
```

### AI coach (optional)

The coach runs in a Supabase Edge Function so the AI provider key never ships in the app.

```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GEMINI_API_KEY=...        # or OPENAI_API_KEY / ANTHROPIC_API_KEY
supabase functions deploy coach
```

Optional: `supabase secrets set COACH_MODEL=...` to pick the model. Without the function the rest of the app works; the coach screen just says it isn't set up.

## What's in the MVP

- Email sign-in, then a one-time disclaimer. Sessions are cached in SQLite and synced to the signed-in account.
- Measure tab: pick rest / postural / kinetic, instructions, 3 s countdown, 30 s (or 45 / 60 s) recording with a progress ring, live waveform and a live frequency hint. Screen stays awake; backgrounding aborts the recording.
- Result screen: a plain-language reading first ("Noticeable hand movement, about 6 times a second. 25% less than your last rest session."), the two readings that matter (amplitude, rate) on a five-band amplitude ruler with the previous session marked, a "what this means" list (level, rhythm, steadiness over the recording, change vs. last session, rank among your history), the research dose model (below), optional context tags, and a collapsed "spectrum and numbers" section with the raw metrics. Save or discard. Hard failures (sensor too slow, recording too short) cannot be saved.
- Research model (`src/model/hill.ts`, `src/ui/dose-model.tsx`): the VibroTremor+ paper's Hill-curve simulation. For a chosen target reduction (30 % / half / 70 % / "down to slight") it shows the modeled daily propranolol dose with and without the closed-loop vibration band, the modeled blood-pressure drop for each, and the two dose–response curves. The curve constants are solved from the paper's reported anchors (320 mg → 50 % with 38.1 mmHg; 90 mg + VTS → 50 % with 18.9 mmHg; VTS alone 48.78 %) plus assumed ceilings, so the model reproduces the paper's headline numbers; `reference/hill_curve.py` was empty, so if it later supplies fitted coefficients, replace `PARAMS`. Shown only after a one-time acknowledgement, can be switched off in Settings, never included in the clinician PDF, and labelled everywhere as a simulation and not a prescription.
- History tab: per-position trend sentence ("Your recent rest readings are 14% lower than your earlier ones over the last 30 days."), typical amplitude and rate, amplitude trend chart, session list with level words, clinician summary entry point.
- Session detail: the same reading layout as the result screen, from stored data.
- Settings: recording duration, default position, research model on/off, units (g / m/s²), axis handling (per-axis default or vector-magnitude "device parity"), dev mode, export all sessions as CSV, delete all data.
- Dev mode: sensor diagnostics on screen, raw samples kept with each saved session, raw CSV export in the Phyphox column layout for cross-checking with `tremor_analyze.py`.
- Clinician summary (from the "Next" tier): one-page PDF with per-position medians/means, trend charts, session table and context counts, labelled self-tracked and non-diagnostic.
- Insights tab (`src/lib/insights.ts`): compares the user's own tagged readings (sleep, caffeine, stress, medication taken, hours since dose, time of day), normalised per position, with a confidence note; weekly count and streak; personalised "Try this" tips (`src/lib/tips.ts`) ranked by what the user's readings point to.
- Tips & help: ~25 practical tips across sleep, food & drink, stress, everyday tasks, phone & typing, exercise and when to see a doctor. Calm-breathing exercise (4 s in / 6 s out) with spoken and vibration cues. Optional daily local reminder (Settings).
- Accessibility & display (`src/state/device-prefs.tsx`, stored on the phone and available before sign-in): light / dark / match phone, high contrast, four in-app text sizes on top of the phone's Dynamic Type, bigger touch targets, "ignore accidental double taps" (700 ms tap guard), spoken instructions during recording and results (expo-speech, or the screen reader when VoiceOver/TalkBack is on), vibration cues, reduce motion (also follows the system setting), and a one-tap "tremor-friendly" preset. Every control has screen-reader roles, labels and hints; charts have spoken summaries.

## Layout

```
src/
  app/                 expo-router screens
    _layout.tsx        auth gate, SQLite + sync repository, settings, disclaimer
    login.tsx          email sign in / sign up
    disclaimer.tsx
    (tabs)/            index (Measure), history, settings
    record.tsx         countdown + capture + analysis hand-off
    result.tsx         metrics, tags, save/discard, dev export
    session/[id].tsx   detail / edit tags / delete / raw export
    summary.tsx        clinician PDF
  dsp/                 pure TypeScript signal processing (no RN imports)
    fft.ts             radix-2 + Bluestein (exact 400-point segments like scipy)
    butterworth.ts     scipy-equivalent SOS design (bilinear transform)
    sosfilt.ts         sosfilt / sosfilt_zi / sosfiltfilt with scipy's odd padding
    welch.ts           Welch PSD with scipy defaults
    resample.ts        numpy.interp-equivalent resampling + timing stats
    analyze.ts         the pipeline from the brief + quality gates
    live.ts            2 s zero-padded estimate for the recording screen
    __tests__/         Jest suites + fixtures generated by scripts/make_fixtures.py
  sensors/recorder.ts  expo-sensors capture with native timestamps (receipt-time fallback)
  data/                SQLite cache + Supabase sync repository
  db/                  expo-sqlite schema, per-user session cache, settings cache
  lib/supabase.ts      Supabase client + SecureStore session persistence
  supabase/schema.sql  run once in your Supabase project
  export/              raw CSV, sessions CSV, clinician summary HTML->PDF, file/share helpers
  model/hill.ts        Hill dose–response simulation (propranolol ± VTS, BP drop), calibrated to the paper
  ui/                  theme ("Instrument" design system), primitives, SVG charts, tag editor, reading components, dose-model panel
  lib/                 units, formatting, compact spectrum JSON, plain-language interpretation (levels, rhythm, change)
scripts/make_fixtures.py  runs reference/tremor_analyze.py + scipy to produce test fixtures
```

## Signal processing

Implemented exactly as in section 5 of the brief and `tremor_analyze.py`:

1. Measured sample rate and jitter (std(dt)/mean(dt)) from the raw timestamps.
2. Linear resample to a uniform 100 Hz grid (`numpy.interp` semantics).
3. Trim 2 s from each end.
4. 4th-order Butterworth 1 Hz high-pass, zero phase (`sosfiltfilt`), per axis.
5. Welch PSD (4 s periodic-Hann segments, 50 % overlap, 0.25 Hz bins), summed over axes.
6. `dominant_hz` (argmax in 4–12 Hz, plus a parabolic-interpolated refinement), `band_power` (trapezoid over 4–12 Hz), `peak_ratio` (±1 Hz around the peak / 1–20 Hz), `rms` of the 4–12 Hz band-passed signal over all axes, normalized spectral entropy over the band bins.
7. Quality gates: rate < 50 Hz and usable duration < 20 s are fatal; jitter > 0.5, peak ratio < 0.15 and slow 0–1 Hz motion above 0.05 g RMS (heuristic, see `DEFAULTS.lfMotionRmsThreshold`) are warnings.

Units pass straight through: the app feeds g and stores g; the Python reference works in m/s². Conversions happen only for display and export (1 g = 9.80665 m/s²).

The vector-magnitude ("device parity") mode runs the same pipeline on √(x²+y²+z²) as a single channel. Sessions store their mode and History only mixes sessions recorded with the current mode.

## Validation

**Cross-implementation (automated).** `scripts/make_fixtures.py` generates deterministic synthetic recordings (the brief's 4.5/6/8/10 Hz × 0.05/0.2/0.8 grid plus a noise-floor case and a 100 Hz case) with a portable PRNG that is reproduced bit-for-bit in `src/dsp/__tests__/synth.ts`, runs them through `tremor_analyze.py`, and dumps the numbers plus scipy's `butter`/`sosfilt`/`sosfiltfilt`/`sosfreqz`/`welch` outputs on fixed signals. Jest then checks:

- filter outputs match scipy to < 1e-9 absolute, frequency responses to < 1e-9;
- Welch PSD matches to < 1e-8 relative;
- on every synthetic case the same PSD bin wins, and RMS / band power / peak ratio match to < 1e-7 relative; the warning set matches too;
- two real CSV files in the Phyphox layout go through both pipelines (the brief's 0.25 Hz / 10 % tolerances pass with a lot of margin: the actual match is exact to rounding).

**Raw export round-trip.** A CSV exported from the app (dev mode) is in the same layout and unit as a Phyphox export, so `python3 reference/tremor_analyze.py recording.csv` runs directly on it. Checked during development on four synthetic recordings: 0.000 Hz difference, ≤ 0.0001 % RMS difference.

**Still to do on a phone (section 8.3–8.5 of the brief):** metronome shake at a known rate in rest and postural positions, phone-on-table noise floor, a second phone, and eventually the VibroTremor+ band. Record with dev mode on so the raw CSV can be pulled and re-analysed. Nothing in the app claims accuracy numbers that have not been measured.

## Decisions made on the brief's open questions

These are assumptions, easy to change:

- **Platform:** built and bundled for both iOS and Android; nothing platform-specific was needed beyond `HIGH_SAMPLING_RATE_SENSORS` on Android 12+ and `NSMotionUsageDescription` on iOS.
- **Name / style:** "Tremor Tracker". Design system "Instrument": warm paper ground, ink, hairline rules, one signal orange used only for live/active/attention, IBM Plex Sans + IBM Plex Mono tabular numerals, radii ≤ 4, no shadows, light and dark mode. Positions are told apart by label and marker shape (● ■ ◆), not colour. Slug `tremor-tracker`, bundle id `com.vibrotremor.tremortracker`.
- **Plain-language levels:** amplitude bands (barely any < 0.015 g, slight < 0.04, noticeable < 0.10, strong < 0.25, very strong) in `src/lib/interpret.ts` are the app's own scale, chosen so a relaxed healthy hand lands in the first two. Every place a level appears says it is not a clinical rating. Thresholds are one constant table and should be revisited after phone trials.
- **Dosing model vs. the brief:** section 9 of the brief rules out dose calculations; the project owner later asked for the paper's Hill-curve simulation to be included as "another layer". It is in, framed as a research model with the caveats above.
- **Magnitude mode:** included as an opt-in setting (default per-axis), stored per session.
- **Band recordings:** `reference/vibrotremor_original.py` in this repo is empty (0 bytes), so nothing could be validated against the band. The device facts in the brief were used directly.
- **Native timestamps:** `expo-sensors` does provide one (`timestamp`, seconds, from `CMAccelerometerData` on iOS and `SensorEvent.timestamp / 1e9` on Android). The recorder uses it and falls back to JS receipt time if it is missing, non-monotonic, or disagrees with receipt timing by more than 3×. The source used is shown in dev mode.

## Not in this build

- Severity score (deliberately deferred by the brief until calibrated).
- db4 wavelet analysis of the per-window RMS sequence (optional in the brief; the per-second RMS strip on the result screen is the precursor).
- Correlation view, educational pharmacokinetics curve, on-device stress classifier, Bluetooth to the band, watch capture.
- Fitted Hill coefficients from `reference/hill_curve.py` (file was empty when this was built; the model is calibrated to the paper's reported numbers instead).
