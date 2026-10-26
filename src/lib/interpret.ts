import { POSITION_LABEL, type Position } from '@/db/types';

/**
 * Plain-language layer over the raw metrics.
 *
 * Everything here describes *movement the phone measured*. The level scale is
 * the app's own, chosen so that a relaxed healthy hand lands in the first one or
 * two bands and a hand that visibly shakes lands in the upper ones. It is not a
 * clinical rating and the copy says so wherever a level is shown.
 */

export type Level = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';

export interface LevelBand {
  id: Level;
  /** lower bound, g RMS in the 4–12 Hz band (inclusive) */
  min: number;
  /** one or two words, used as an adjective: "Slight hand movement" */
  label: string;
  /** one sentence of what a reading in this band usually means */
  meaning: string;
}

export const LEVELS: LevelBand[] = [
  {
    id: 'very_low',
    min: 0,
    label: 'Barely any',
    meaning: 'This is the small, fast movement every hand has. Most people measure here when relaxed.',
  },
  {
    id: 'low',
    min: 0.015,
    label: 'Slight',
    meaning: 'Measurable but small. Often not visible to the eye.',
  },
  {
    id: 'moderate',
    min: 0.04,
    label: 'Noticeable',
    meaning: 'Movement you would usually be able to see in the hand.',
  },
  {
    id: 'high',
    min: 0.1,
    label: 'Strong',
    meaning: 'Clearly visible movement that can affect fine tasks like writing or holding a cup.',
  },
  {
    id: 'very_high',
    min: 0.25,
    label: 'Very strong',
    meaning: 'Large movement. Check the recording was not disturbed, then compare across sessions.',
  },
];

export const LEVEL_SCALE_NOTE = 'Levels are this app’s own scale for phone-measured movement, not a clinical rating.';

export function levelFor(rmsG: number): LevelBand {
  let band = LEVELS[0];
  for (const b of LEVELS) if (rmsG >= b.min) band = b;
  return band;
}

export function levelIndex(level: Level): number {
  return LEVELS.findIndex((b) => b.id === level);
}

/** Position of a value along the five-band scale, 0..1, log-spaced inside bands. */
export function scalePosition(rmsG: number): number {
  const n = LEVELS.length;
  const i = levelIndex(levelFor(rmsG).id);
  const lo = Math.max(LEVELS[i].min, 1e-4);
  const hi = i + 1 < n ? LEVELS[i + 1].min : LEVELS[i].min * 4;
  const v = Math.max(lo, Math.min(hi, rmsG));
  const frac = (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return (i + Math.max(0, Math.min(1, frac))) / n;
}

/* ---------- rhythm ---------- */

export interface Rhythm {
  label: string;
  detail: string;
}

export function rhythmFor(peakRatio: number, entropy: number): Rhythm {
  if (peakRatio >= 0.6) return { label: 'One clear rhythm', detail: 'Most of the movement happened at a single, steady rate.' };
  if (peakRatio >= 0.3) return { label: 'Fairly regular', detail: 'A main rhythm with some movement at other rates mixed in.' };
  if (peakRatio >= 0.15) return { label: 'Irregular', detail: 'Movement was spread across several rates rather than one beat.' };
  return {
    label: 'No clear rhythm',
    detail: entropy > 0.9 ? 'The movement looks like general unsteadiness or noise, not a repeating shake.' : 'No single rate stood out.',
  };
}

/* ---------- steadiness over the recording ---------- */

export interface Steadiness {
  label: string;
  detail: string;
  /** last-third / first-third amplitude ratio */
  ratio: number;
}

export function steadinessFor(timeline: ArrayLike<number>): Steadiness | null {
  const n = timeline.length;
  if (n < 6) return null;
  const third = Math.floor(n / 3);
  const avg = (a: number, b: number) => {
    let s = 0;
    for (let i = a; i < b; i++) s += timeline[i];
    return s / Math.max(1, b - a);
  };
  const first = avg(0, third);
  const last = avg(n - third, n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += timeline[i];
  mean /= n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (timeline[i] - mean) ** 2;
  const cv = mean > 0 ? Math.sqrt(varSum / n) / mean : 0;
  const ratio = first > 0 ? last / first : 1;
  if (ratio < 0.75) return { label: 'Eased off', detail: 'The movement settled as the recording went on.', ratio };
  if (ratio > 1.33) return { label: 'Built up', detail: 'The movement grew as the recording went on.', ratio };
  if (cv < 0.35) return { label: 'Steady throughout', detail: 'About the same amount of movement from start to finish.', ratio };
  return { label: 'Came and went', detail: 'The movement rose and fell in bursts during the recording.', ratio };
}

/* ---------- comparisons ---------- */

export interface Change {
  /** relative change, e.g. −0.12 */
  rel: number;
  /** "12% less", "about the same", "8% more" */
  short: string;
  /** full sentence */
  sentence: string;
  direction: 'less' | 'same' | 'more';
}

export function changeFor(current: number, previous: number, positionLabel: string): Change | null {
  if (!(previous > 0) || !(current >= 0)) return null;
  const rel = (current - previous) / previous;
  if (Math.abs(rel) < 0.05) {
    return { rel, short: 'about the same', direction: 'same', sentence: `About the same as your last ${positionLabel} session.` };
  }
  const pct = Math.round(Math.abs(rel) * 100);
  if (rel < 0) {
    return { rel, short: `${pct}% less`, direction: 'less', sentence: `${pct}% less movement than your last ${positionLabel} session.` };
  }
  return { rel, short: `${pct}% more`, direction: 'more', sentence: `${pct}% more movement than your last ${positionLabel} session.` };
}

/** Fraction of `others` that are strictly greater than `current` (0..1), or null when there is nothing to compare. */
export function fractionBelow(current: number, others: ArrayLike<number>): number | null {
  const n = others.length;
  if (n === 0) return null;
  let greater = 0;
  for (let i = 0; i < n; i++) if (others[i] > current) greater++;
  return greater / n;
}

export function historySentence(current: number, others: ArrayLike<number>, positionLabel: string): string | null {
  const f = fractionBelow(current, others);
  if (f === null) return null;
  const n = others.length;
  if (n < 3) return null;
  const pct = Math.round(f * 100);
  if (pct >= 80) return `Lower than ${pct}% of your ${n} previous ${positionLabel} sessions. One of your calmest.`;
  if (pct <= 20) return `Higher than ${100 - pct}% of your ${n} previous ${positionLabel} sessions.`;
  return `In the middle of your ${n} previous ${positionLabel} sessions (lower than ${pct}% of them).`;
}

/* ---------- the whole reading ---------- */

export interface InterpretInput {
  position: Position;
  rmsG: number;
  dominantHz: number;
  peakRatio: number;
  spectralEntropy: number;
  rmsTimeline?: ArrayLike<number>;
  previous?: { rmsG: number; dominantHz: number } | null;
  /** amplitudes of earlier sessions in the same position (g) */
  history?: ArrayLike<number>;
}

export interface Interpretation {
  level: LevelBand;
  levelIndex: number;
  scalePosition: number;
  /** e.g. "about 6 times a second" */
  frequencyPhrase: string;
  headline: string;
  rhythm: Rhythm;
  steadiness: Steadiness | null;
  change: Change | null;
  frequencyChange: string | null;
  history: string | null;
}

export function frequencyPhrase(hz: number): string {
  const rounded = Math.round(hz * 10) / 10;
  const whole = Math.abs(rounded - Math.round(rounded)) < 0.05;
  return `about ${whole ? Math.round(rounded) : rounded.toFixed(1)} times a second`;
}

export function interpret(input: InterpretInput): Interpretation {
  const positionLabel = POSITION_LABEL[input.position].toLowerCase();
  const level = levelFor(input.rmsG);
  const change = input.previous ? changeFor(input.rmsG, input.previous.rmsG, positionLabel) : null;
  const freq = frequencyPhrase(input.dominantHz);

  let frequencyChange: string | null = null;
  if (input.previous) {
    const d = input.dominantHz - input.previous.dominantHz;
    frequencyChange =
      Math.abs(d) >= 1
        ? `The rate shifted from ${input.previous.dominantHz.toFixed(1)} to ${input.dominantHz.toFixed(1)} per second.`
        : `The rate is unchanged at ${input.dominantHz.toFixed(1)} per second. Frequency is usually the most stable part of a tremor.`;
  }

  const headline = `${level.label} hand movement, ${freq}.`;

  return {
    level,
    levelIndex: levelIndex(level.id),
    scalePosition: scalePosition(input.rmsG),
    frequencyPhrase: freq,
    headline,
    rhythm: rhythmFor(input.peakRatio, input.spectralEntropy),
    steadiness: input.rmsTimeline ? steadinessFor(input.rmsTimeline) : null,
    change,
    frequencyChange,
    history: input.history ? historySentence(input.rmsG, input.history, positionLabel) : null,
  };
}

/** Summary for a list of sessions in one position (History tab). */
export function trendSentence(values: { t: number; v: number }[], positionLabel: string, days: number | null): string | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a.t - b.t);
  const half = Math.floor(sorted.length / 2);
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const early = med(sorted.slice(0, half).map((p) => p.v));
  const late = med(sorted.slice(half).map((p) => p.v));
  if (!(early > 0)) return null;
  const rel = (late - early) / early;
  const span = days ? `over the last ${days} days` : 'over all your sessions';
  const pct = Math.round(Math.abs(rel) * 100);
  if (Math.abs(rel) < 0.1) return `Your ${positionLabel} readings have been steady ${span}.`;
  return rel < 0
    ? `Your recent ${positionLabel} readings are ${pct}% lower than your earlier ones ${span}.`
    : `Your recent ${positionLabel} readings are ${pct}% higher than your earlier ones ${span}.`;
}
