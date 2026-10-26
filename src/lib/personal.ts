import { dayPart, relativeAmplitudes, type DayPart, type InsightSession } from './insights';

/**
 * Numbers about *this* user, always relative to their own history (never to
 * other people): today vs. their usual, this week vs. last, their steadiest
 * time of day, and small milestones.
 */

const DAY_MS = 24 * 3600 * 1000;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function greeting(name: string | null, now = new Date()): string {
  const h = now.getHours();
  const part = h < 5 ? 'Hi' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

/**
 * The latest session compared with the median of earlier sessions in the same
 * position. Needs at least 3 earlier sessions to call anything "usual".
 */
export function latestVsUsual<T extends InsightSession>(sessions: T[]): { session: T; rel: number } | null {
  if (sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const latest = sorted[0];
  const earlier = sorted.slice(1).filter((s) => s.position === latest.position);
  if (earlier.length < 3) return null;
  const usual = median(earlier.map((s) => s.rmsG));
  if (!(usual > 0)) return null;
  return { session: latest, rel: latest.rmsG / usual - 1 };
}

/** Median relative amplitude of the last 7 days vs. everything before. */
export function recentVsEarlier(sessions: InsightSession[], now = new Date()): number | null {
  const cut = now.getTime() - 7 * DAY_MS;
  const rows = relativeAmplitudes(sessions);
  const recent = rows.filter((r) => Date.parse(r.s.startedAt) >= cut).map((r) => r.ratio);
  const earlier = rows.filter((r) => Date.parse(r.s.startedAt) < cut).map((r) => r.ratio);
  if (recent.length < 3 || earlier.length < 5) return null;
  const e = median(earlier);
  return e > 0 ? median(recent) / e - 1 : null;
}

export interface WeekRecap {
  count: number;
  lastWeekCount: number;
  /** this week's typical level vs last week's, relative; null if not enough of either */
  change: number | null;
  /** steadiest part of the day this week, if it had 2+ readings */
  steadiestPart: DayPart | null;
  taggedCount: number;
}

export function weekRecap(sessions: InsightSession[], now = new Date()): WeekRecap {
  const t = now.getTime();
  const rows = relativeAmplitudes(sessions);
  const inRange = (from: number, to: number) => rows.filter((r) => {
    const x = Date.parse(r.s.startedAt);
    return x >= from && x < to;
  });
  const thisWeek = inRange(t - 7 * DAY_MS, t + 1);
  const lastWeek = inRange(t - 14 * DAY_MS, t - 7 * DAY_MS);
  const change =
    thisWeek.length >= 2 && lastWeek.length >= 2 ? median(thisWeek.map((r) => r.ratio)) / median(lastWeek.map((r) => r.ratio)) - 1 : null;

  const parts = new Map<DayPart, number[]>();
  for (const r of thisWeek) {
    const p = dayPart(r.s.startedAt);
    parts.set(p, [...(parts.get(p) ?? []), r.ratio]);
  }
  const usable = [...parts.entries()].filter(([, v]) => v.length >= 2).map(([p, v]) => ({ p, m: median(v) }));
  usable.sort((a, b) => a.m - b.m);

  return {
    count: thisWeek.length,
    lastWeekCount: lastWeek.length,
    change,
    steadiestPart: usable.length >= 2 ? usable[0].p : null,
    taggedCount: thisWeek.filter((r) => r.s.sleep !== null || r.s.stress !== null || r.s.caffeine !== null || r.s.medsTaken !== null).length,
  };
}

/** "18% steadier than usual" / "About your usual" / "12% more movement than usual" */
export function relPhrase(rel: number): string {
  const pct = Math.round(Math.abs(rel) * 100);
  if (pct < 8) return 'Similar to usual';
  return rel < 0 ? `${pct}% lower than usual` : `${pct}% higher than usual`;
}

export interface Milestone {
  id: string;
  label: string;
}

const COUNT_MILESTONES = [1, 10, 25, 50, 100, 250];

/** The most recent milestone reached, for a small celebration. */
export function latestMilestone(total: number, streakDays: number): Milestone | null {
  if (streakDays >= 7) return { id: `streak-${Math.floor(streakDays / 7) * 7}`, label: `${streakDays}-day streak` };
  const hit = [...COUNT_MILESTONES].reverse().find((m) => total >= m);
  if (!hit) return null;
  return { id: `count-${hit}`, label: `${hit} reading${hit === 1 ? '' : 's'}` };
}
