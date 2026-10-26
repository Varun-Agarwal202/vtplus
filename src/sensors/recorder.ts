/**
 * Accelerometer capture.
 *
 * Collects timestamped samples for a fixed duration. Each sample keeps both the
 * native sensor timestamp (seconds; iOS: CMAccelerometerData.timestamp,
 * Android: SensorEvent.timestamp / 1e9) and the JS receipt time. After the
 * recording we pick the native clock unless it looks broken (non-monotonic or
 * wildly inconsistent with receipt timing), in which case receipt time is used.
 *
 * The actual delivery rate is treated as unknown: `Accelerometer.setUpdateInterval`
 * is a request, not a guarantee. `analyze()` resamples to a uniform grid.
 */
import type { EventSubscription } from 'expo';
import { Accelerometer, type AccelerometerMeasurement } from 'expo-sensors';

import type { Sample } from '@/dsp/types';

export type TimestampSource = 'native' | 'receipt';

export interface Recording {
  samples: Sample[];
  startedAt: Date;
  requestedIntervalMs: number;
  /** wall-clock seconds between start and stop */
  elapsedS: number;
  timestampSource: TimestampSource;
  /** samples / elapsed, straight from the raw stream */
  measuredFsHz: number;
}

export interface RecorderCallbacks {
  /** called on every sample (hot path; keep it cheap) */
  onSample?: (sample: Sample, index: number) => void;
  /** called ~10x per second with elapsed seconds */
  onProgress?: (elapsedS: number) => void;
  onComplete: (rec: Recording) => void;
  onError: (err: Error) => void;
}

export interface RecorderOptions {
  durationS: number;
  /** requested update interval; 10 ms ~ 100 Hz */
  intervalMs?: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class Recorder {
  private sub: EventSubscription | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private native: number[] = [];
  private receipt: number[] = [];
  private xs: number[] = [];
  private ys: number[] = [];
  private zs: number[] = [];
  private startedAt = new Date();
  private t0 = 0;
  private running = false;
  private disposed = false;

  constructor(
    private readonly opts: RecorderOptions,
    private readonly cb: RecorderCallbacks,
  ) {}

  get isRunning() {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running || this.disposed) return;
    const available = await Accelerometer.isAvailableAsync();
    if (this.disposed) return;
    if (!available) {
      this.cb.onError(new Error('Accelerometer is not available on this device.'));
      return;
    }
    const perm = await Accelerometer.getPermissionsAsync();
    if (this.disposed) return;
    if (!perm.granted) {
      const req = await Accelerometer.requestPermissionsAsync();
      if (this.disposed) return;
      if (!req.granted) {
        this.cb.onError(new Error('Motion sensor permission was not granted.'));
        return;
      }
    }

    const intervalMs = this.opts.intervalMs ?? 10;
    Accelerometer.setUpdateInterval(intervalMs);

    this.native = [];
    this.receipt = [];
    this.xs = [];
    this.ys = [];
    this.zs = [];
    this.startedAt = new Date();
    this.t0 = now();
    this.running = true;

    this.sub = Accelerometer.addListener((m: AccelerometerMeasurement) => {
      if (!this.running) return;
      const tr = now() - this.t0;
      const i = this.xs.length;
      this.native.push(typeof m.timestamp === 'number' ? m.timestamp : NaN);
      this.receipt.push(tr);
      this.xs.push(m.x);
      this.ys.push(m.y);
      this.zs.push(m.z);
      this.cb.onSample?.({ t: tr, x: m.x, y: m.y, z: m.z }, i);
    });

    this.timer = setInterval(() => {
      if (this.running) this.cb.onProgress?.(now() - this.t0);
    }, 100);

    this.stopTimer = setTimeout(() => this.finish(), this.opts.durationS * 1000);
  }

  /** Abort without producing a result (e.g. user cancelled, app backgrounded). */
  cancel(): void {
    this.disposed = true;
    this.teardown();
  }

  /** Stop now and deliver whatever has been recorded so far (the analysis applies its own minimum-length check). */
  stopEarly(): void {
    this.finish();
  }

  private finish(): void {
    if (!this.running) return;
    const elapsedS = now() - this.t0;
    this.teardown();
    try {
      this.cb.onComplete(this.buildRecording(elapsedS));
    } catch (e) {
      this.cb.onError(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private teardown(): void {
    this.running = false;
    this.sub?.remove();
    this.sub = null;
    if (this.timer) clearInterval(this.timer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.timer = null;
    this.stopTimer = null;
  }

  private buildRecording(elapsedS: number): Recording {
    const n = this.xs.length;
    const source = chooseTimestampSource(this.native, this.receipt);
    const t = source === 'native' ? rebase(this.native) : this.receipt;
    const samples: Sample[] = new Array(n);
    for (let i = 0; i < n; i++) samples[i] = { t: t[i], x: this.xs[i], y: this.ys[i], z: this.zs[i] };
    return {
      samples,
      startedAt: this.startedAt,
      requestedIntervalMs: this.opts.intervalMs ?? 10,
      elapsedS,
      timestampSource: source,
      measuredFsHz: n > 1 && elapsedS > 0 ? (n - 1) / elapsedS : 0,
    };
  }
}

function rebase(t: number[]): number[] {
  const t0 = t[0] ?? 0;
  return t.map((v) => v - t0);
}

function median(a: number[]): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Prefer native sensor timestamps; fall back to receipt time if they are
 * missing, non-monotonic, or disagree with the receipt clock by more than 3x.
 */
export function chooseTimestampSource(native: number[], receipt: number[]): TimestampSource {
  const n = native.length;
  if (n < 3) return 'receipt';
  if (native.some((v) => !Number.isFinite(v))) return 'receipt';
  const dn: number[] = [];
  const dr: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = native[i] - native[i - 1];
    if (d < 0) return 'receipt';
    dn.push(d);
    dr.push(receipt[i] - receipt[i - 1]);
  }
  const mn = median(dn);
  const mr = median(dr);
  if (!(mn > 0) || !(mr > 0)) return 'receipt';
  const ratio = mn / mr;
  if (ratio > 3 || ratio < 1 / 3) return 'receipt';
  return 'native';
}
