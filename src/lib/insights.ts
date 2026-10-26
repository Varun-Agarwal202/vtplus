import type { Position, Sleep } from '@/db/types';

/**
 * Personal patterns from the user's own tagged sessions.
 *
 * Readings are only comparable within a position (rest is naturally lower
 * than postural), so every session is first expressed relative to the median
 * of its position. Groups are then compared by the median of those ratios,
 * which keeps one odd recording from dominating.
 *
 * These are observations, not causes: the copy always says "readings were",
 * never "X makes your tremor worse".
 */

export interface InsightSession {
  startedAt: string;
  position: Position;
  rmsG: number;
  sleep: Sleep | null;
  stress: number | null;
  caffeine: boolean | null;
  medsTaken: boolean | null;
  medsTime: string | null;
}

export type FactorId = 'sleep' | 'caffeine' | 'stress' | 'meds' | 'medsTiming' | 'timeOfDay';

export type Confidence = 'early' | 'some' | 'good';

export interface Insight {
  factor: FactorId;
  /** e.g. "After poor sleep" */
  title: string;
  /** one plain sentence */
  sentence: string;
  /** relative difference of the "worse-suspected" group vs the other, e.g. 0.3 = 30% higher */
  rel: number;
  direction: 'higher' | 'lower' | 'same';
  confidence: Confidence;
  /** how many sessions back each side */
  counts: [number, number];
  /** the group label with the higher readings, for tips */
  higherGroup: string;
  /** the group label with the lower readings */
  lowerGroup: string;
}

export const MIN_PER_GROUP = 2;
/** differences smaller than this are reported as "no clear difference" */
export const SAME_THRESHOLD = 0.1;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function confidenceFor(a: number, b: number): Confidence {
  const n = Math.min(a, b);
  if (n >= 8) return 'good';
  if (n >= 4) return 'some';
  return 'early';
}

export const CONFIDENCE_NOTE: Record<Confidence, string> = {
  early: 'Based on only a few readings.',
  some: 'Based on a moderate number of readings.',
  good: 'Based on many readings.',
};

/** Each session's amplitude divided by the median amplitude of its position. */
export function relativeAmplitudes<T extends InsightSession>(sessions: T[]): { s: T; ratio: number }[] {
  const byPos = new Map<Position, number[]>();
  for (const s of sessions) {
    if (!(s.rmsG > 0)) continue;
    const list = byPos.get(s.position) ?? [];
    list.push(s.rmsG);
    byPos.set(s.position, list);
  }
  const med = new Map<Position, number>();
  byPos.forEach((v, k) => med.set(k, median(v)));
  return sessions.filter((s) => s.rmsG > 0 && (med.get(s.position) ?? 0) > 0).map((s) => ({ s, ratio: s.rmsG / (med.get(s.position) as number) }));
}

function compare(
  factor: FactorId,
  rows: { s: InsightSession; ratio: number }[],
  isA: (s: InsightSession) => boolean,
  isB: (s: InsightSession) => boolean,
  labels: { a: string; b: string; title: string },
): Insight | null {
  const a = rows.filter((r) => isA(r.s)).map((r) => r.ratio);
  const b = rows.filter((r) => isB(r.s)).map((r) => r.ratio);
  if (a.length < MIN_PER_GROUP || b.length < MIN_PER_GROUP) return null;
  const ma = median(a);
  const mb = median(b);
  if (!(mb > 0)) return null;
  const rel = ma / mb - 1;
  const pct = Math.round(Math.abs(rel) * 100);
  const confidence = confidenceFor(a.length, b.length);
  const counts: [number, number] = [a.length, b.length];
  if (Math.abs(rel) < SAME_THRESHOLD) {
    return {
      factor,
      title: labels.title,
      sentence: `No clear difference in your readings ${labels.a} compared with ${labels.b}.`,
      rel,
      direction: 'same',
      confidence,
      counts,
      higherGroup: '',
      lowerGroup: '',
    };
  }
  const higher = rel > 0;
  return {
    factor,
    title: labels.title,
    sentence: `Your readings ${labels.a} were ${pct}% ${higher ? 'higher' : 'lower'} than ${labels.b}.`,
    rel,
    direction: higher ? 'higher' : 'lower',
    confidence,
    counts,
    higherGroup: higher ? labels.a : labels.b,
    lowerGroup: higher ? labels.b : labels.a,
  };
}

/** "08:30", "8.30", "8:30pm", "20" → hours since midnight, or null. */
export function parseClock(text: string | null): number | null {
  if (!text) return null;
  const m = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a|p)?\s*$/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  const ap = m[3]?.toLowerCase();
  if (ap?.startsWith('p') && h < 12) h += 12;
  if (ap?.startsWith('a') && h === 12) h = 0;
  return h + min / 60;
}

/** Local clock hours of an ISO timestamp. */
export function localHours(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

/** Hours between the dose clock time and the session, assuming the dose was earlier the same day. */
export function hoursSinceDose(s: InsightSession): number | null {
  if (!s.medsTaken) return null;
  const dose = parseClock(s.medsTime);
  if (dose === null) return null;
  let h = localHours(s.startedAt) - dose;
  if (h < 0) h += 24;
  return h <= 16 ? h : null;
}

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(iso: string): DayPart {
  const h = new Date(iso).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

export const DAY_PART_LABEL: Record<DayPart, string> = {
  morning: 'in the morning',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  night: 'at night',
};

function bucketExtremes<K extends string>(
  rows: { s: InsightSession; ratio: number }[],
  keyOf: (s: InsightSession) => K | null,
): { lo: { key: K; med: number; n: number }; hi: { key: K; med: number; n: number } } | null {
  const groups = new Map<K, number[]>();
  for (const r of rows) {
    const k = keyOf(r.s);
    if (k === null) continue;
    const list = groups.get(k) ?? [];
    list.push(r.ratio);
    groups.set(k, list);
  }
  const usable = Array.from(groups.entries())
    .filter(([, v]) => v.length >= MIN_PER_GROUP)
    .map(([key, v]) => ({ key, med: median(v), n: v.length }));
  if (usable.length < 2) return null;
  usable.sort((a, b) => a.med - b.med);
  return { lo: usable[0], hi: usable[usable.length - 1] };
}

function timeOfDayInsight(rows: { s: InsightSession; ratio: number }[]): Insight | null {
  const ex = bucketExtremes(rows, (s) => dayPart(s.startedAt));
  if (!ex) return null;
  const rel = ex.hi.med / ex.lo.med - 1;
  const confidence = confidenceFor(ex.lo.n, ex.hi.n);
  if (rel < SAME_THRESHOLD) {
    return {
      factor: 'timeOfDay',
      title: 'Time of day',
      sentence: 'Your readings are about the same at different times of day.',
      rel,
      direction: 'same',
      confidence,
      counts: [ex.hi.n, ex.lo.n],
      higherGroup: '',
      lowerGroup: '',
    };
  }
  return {
    factor: 'timeOfDay',
    title: 'Time of day',
    sentence: `Your steadiest readings were ${DAY_PART_LABEL[ex.lo.key]}. Readings ${DAY_PART_LABEL[ex.hi.key]} were ${Math.round(rel * 100)}% higher.`,
    rel,
    direction: 'higher',
    confidence,
    counts: [ex.hi.n, ex.lo.n],
    higherGroup: DAY_PART_LABEL[ex.hi.key],
    lowerGroup: DAY_PART_LABEL[ex.lo.key],
  };
}

type DoseBucket = '0–2 hours' | '2–4 hours' | '4–8 hours' | 'over 8 hours';

function doseBucket(h: number): DoseBucket {
  if (h < 2) return '0–2 hours';
  if (h < 4) return '2–4 hours';
  if (h < 8) return '4–8 hours';
  return 'over 8 hours';
}

function medsTimingInsight(rows: { s: InsightSession; ratio: number }[]): Insight | null {
  const ex = bucketExtremes(rows, (s) => {
    const h = hoursSinceDose(s);
    return h === null ? null : doseBucket(h);
  });
  if (!ex) return null;
  const rel = ex.hi.med / ex.lo.med - 1;
  if (rel < SAME_THRESHOLD) return null;
  return {
    factor: 'medsTiming',
    title: 'Medication timing',
    sentence: `Your readings were lowest ${ex.lo.key} after your medication, and ${Math.round(rel * 100)}% higher ${ex.hi.key} after.`,
    rel,
    direction: 'higher',
    confidence: confidenceFor(ex.lo.n, ex.hi.n),
    counts: [ex.hi.n, ex.lo.n],
    higherGroup: `${ex.hi.key} after a dose`,
    lowerGroup: `${ex.lo.key} after a dose`,
  };
}

export function findInsights(sessions: InsightSession[]): Insight[] {
  const rows = relativeAmplitudes(sessions);
  const out: (Insight | null)[] = [
    compare('sleep', rows, (s) => s.sleep === 'poor', (s) => s.sleep === 'ok' || s.sleep === 'good', {
      a: 'after poor sleep',
      b: 'after OK or good sleep',
      title: 'Sleep',
    }),
    compare('caffeine', rows, (s) => s.caffeine === true, (s) => s.caffeine === false, {
      a: 'after caffeine',
      b: 'without caffeine',
      title: 'Caffeine',
    }),
    compare('stress', rows, (s) => s.stress !== null && s.stress >= 4, (s) => s.stress !== null && s.stress <= 2, {
      a: 'when stressed (4–5)',
      b: 'when calm (1–2)',
      title: 'Stress',
    }),
    compare('meds', rows, (s) => s.medsTaken === false, (s) => s.medsTaken === true, {
      a: 'without your medication',
      b: 'with it',
      title: 'Medication',
    }),
    medsTimingInsight(rows),
    timeOfDayInsight(rows),
  ];
  const found = out.filter((x): x is Insight => x !== null);
  // strongest real differences first, "no difference" findings last
  return found.sort((a, b) => {
    if ((a.direction === 'same') !== (b.direction === 'same')) return a.direction === 'same' ? 1 : -1;
    return Math.abs(b.rel) - Math.abs(a.rel);
  });
}

/* ---------- habits ---------- */

export interface Habits {
  /** sessions in the last 7 days */
  thisWeek: number;
  /** consecutive days, ending today or yesterday, with at least one session */
  streakDays: number;
  /** fraction of sessions with at least one context tag */
  taggedShare: number;
  total: number;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function habitsFor(sessions: InsightSession[], now = new Date()): Habits {
  const weekAgo = now.getTime() - 7 * 24 * 3600 * 1000;
  const thisWeek = sessions.filter((s) => Date.parse(s.startedAt) >= weekAgo).length;
  const days = new Set(sessions.map((s) => dayKey(new Date(s.startedAt))));
  let streakDays = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const tagged = sessions.filter((s) => s.sleep !== null || s.stress !== null || s.caffeine !== null || s.medsTaken !== null).length;
  return { thisWeek, streakDays, taggedShare: sessions.length ? tagged / sessions.length : 0, total: sessions.length };
}
