/** A raw accelerometer sample. Units are whatever the caller supplies (the app uses g). */
export interface Sample {
  /** seconds, monotonic, not necessarily uniform */
  t: number;
  x: number;
  y: number;
  z: number;
}

/**
 * How the three axes are combined.
 *  - 'axes'      per-axis high-pass, PSD summed across axes (default, orientation independent)
 *  - 'magnitude' vector magnitude first, then a single-channel pipeline (VibroTremor+ device parity)
 */
export type AnalysisMode = 'axes' | 'magnitude';

export type QualityFlag =
  | 'low_sample_rate'
  | 'short_recording'
  | 'high_jitter'
  | 'weak_peak'
  | 'low_frequency_motion';

export interface QualityIssue {
  flag: QualityFlag;
  /** true = the result should not be trusted or saved as a measurement */
  fatal: boolean;
  message: string;
}

export interface AnalysisOptions {
  /** analysis sample rate after resampling (Hz) */
  fs?: number;
  /** seconds trimmed from each end */
  trimS?: number;
  /** tremor band [lo, hi] in Hz */
  band?: [number, number];
  /** Welch segment length in seconds */
  welchSegmentS?: number;
  mode?: AnalysisMode;
  /** heuristic threshold (same units as the input) for the low-frequency motion warning */
  lfMotionRmsThreshold?: number;
}

export interface Spectrum {
  f: Float64Array;
  psd: Float64Array;
}

export interface AnalysisResult {
  /** measured sample rate of the raw recording (Hz) */
  measuredFsHz: number;
  /** std(dt) / mean(dt) of the raw timestamps */
  jitter: number;
  /** seconds remaining after trimming */
  durationS: number;
  /** total raw recording length in seconds */
  rawDurationS: number;
  rawSampleCount: number;
  mode: AnalysisMode;

  /** PSD bin with the largest power inside the tremor band (Hz) */
  dominantHz: number;
  /** dominantHz refined by parabolic interpolation around the peak (Hz) */
  dominantHzInterp: number;
  /** integral of the PSD over the tremor band (units^2) */
  bandPower: number;
  /** power within +/-1 Hz of the peak divided by power in 1-20 Hz */
  peakRatio: number;
  /** RMS of the band-passed signal, all axes combined (input units) */
  rms: number;
  /** normalized spectral entropy over the tremor band (0..1) */
  spectralEntropy: number;
  /** RMS of slow (0-1 Hz) motion before the high-pass (input units) */
  lfMotionRms: number;

  /** PSD summed across axes, after high-pass, 0..fs/2 */
  spectrum: Spectrum;
  /** RMS of the band-passed signal in consecutive 1 s windows (input units) */
  rmsTimeline: Float64Array;

  issues: QualityIssue[];
  /** convenience: true when no fatal issue is present */
  ok: boolean;
}
