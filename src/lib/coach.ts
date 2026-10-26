import type { Session } from '@/db/types';
import { POSITION_LABEL } from '@/db/types';
import { getSupabase, supabaseConfigured } from './supabase';
import { CONFIDENCE_NOTE, type Insight } from './insights';
import { levelFor } from './interpret';
import type { WeekRecap } from './personal';
import { CONDITION_LABEL, HAND_LABEL, TASK_PHRASE, TRIGGER_LABEL, type Profile } from './profile';

export type CoachMessage = { role: 'user' | 'assistant'; content: string };

/**
 * A compact plain-text brief of this user's profile and readings for the coach.
 * Levels are given as words and relative numbers; no account identifiers.
 */
export function buildCoachContext(p: {
  profile: Profile;
  sessions: Session[];
  insights: Insight[];
  recap: WeekRecap;
  recentChange: number | null;
  streakDays: number;
  now?: Date;
}): string {
  const { profile, sessions, insights, recap } = p;
  const now = p.now ?? new Date();
  const lines: string[] = [`Today is ${now.toDateString()}, local time ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}.`];

  const about: string[] = [];
  if (profile.name) about.push(`Name: ${profile.name}`);
  if (profile.condition) about.push(`Condition: ${CONDITION_LABEL[profile.condition]}`);
  if (profile.hand) about.push(`Most affected hand: ${HAND_LABEL[profile.hand]}`);
  if (profile.hardTasks.length) about.push(`Finds hard: ${profile.hardTasks.map((t) => TASK_PHRASE[t]).join(', ')}`);
  if (profile.triggers.length) about.push(`Suspects these make it worse: ${profile.triggers.map((t) => TRIGGER_LABEL[t].toLowerCase()).join(', ')}`);
  if (profile.takesMeds !== null) about.push(`Takes tremor medication: ${profile.takesMeds ? `yes${profile.medName ? ` (${profile.medName})` : ''}` : 'no'}`);
  lines.push(about.length ? `ABOUT THEM\n${about.join('\n')}` : 'ABOUT THEM\nNo profile filled in yet.');

  lines.push(
    `READINGS (last 90 days)\nTotal: ${sessions.length}. This week: ${recap.count}, last week: ${recap.lastWeekCount}. Current streak: ${p.streakDays} days.` +
      (recap.change !== null ? ` This week's typical level vs last week: ${pct(recap.change)}.` : '') +
      (p.recentChange !== null ? ` Last 7 days vs earlier: ${pct(p.recentChange)}.` : '') +
      `\nScale (lowest to highest): Barely any, Slight, Noticeable, Strong, Very strong.`,
  );

  const recent = [...sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 15);
  if (recent.length) {
    lines.push(
      'MOST RECENT READINGS\n' +
        recent
          .map((s) => {
            const d = new Date(s.startedAt);
            const tags = [
              s.sleep ? `sleep ${s.sleep}` : null,
              s.stress !== null ? `stress ${s.stress}/5` : null,
              s.caffeine !== null ? (s.caffeine ? 'caffeine' : 'no caffeine') : null,
              s.medsTaken !== null ? (s.medsTaken ? `meds taken${s.medsTime ? ` at ${s.medsTime}` : ''}` : 'no meds') : null,
              s.notes ? `note: "${s.notes.slice(0, 80)}"` : null,
            ].filter(Boolean);
            return `- ${d.toDateString()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}, ${POSITION_LABEL[s.position].toLowerCase()}: ${levelFor(s.rmsG).label}, ${s.dominantHz.toFixed(1)} Hz${tags.length ? ` (${tags.join(', ')})` : ''}`;
          })
          .join('\n'),
    );
  }

  if (insights.length) {
    lines.push('PATTERNS FOUND IN THEIR TAGS\n' + insights.map((i) => `- ${i.sentence} (${CONFIDENCE_NOTE[i.confidence]} ${i.counts[0]} vs ${i.counts[1]} readings)`).join('\n'));
  } else {
    lines.push('PATTERNS FOUND IN THEIR TAGS\nNone yet (not enough tagged readings).');
  }
  return lines.join('\n\n');
}

function pct(rel: number): string {
  const n = Math.round(rel * 100);
  return n === 0 ? 'no change' : `${n > 0 ? '+' : ''}${n}%`;
}

export class CoachUnavailable extends Error {}

export async function askCoach(messages: CoachMessage[], context: string): Promise<string> {
  if (!supabaseConfigured) throw new CoachUnavailable('Sign-in isn’t configured.');
  const { data, error } = await getSupabase().functions.invoke<{ reply?: string; error?: string }>('coach', { body: { messages, context } });
  if (error) {
    const res = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
    const status = res?.status;
    if (status === undefined) throw new Error('Couldn’t connect. Check your connection and try again.');
    let code: string | undefined;
    try {
      code = ((await res?.json?.()) as { error?: string } | undefined)?.error;
    } catch {
      code = undefined;
    }
    if (status === 404 || code === 'not_configured') throw new CoachUnavailable('AI answers aren’t enabled yet.');
    if (status === 401) throw new Error('Your session expired. Sign out and back in, then try again.');
    if (code === 'provider_busy' || status === 429) throw new Error('The AI service is busy right now. Try again in a minute.');
    throw new Error('The AI service had a problem. Try again shortly.');
  }
  if (!data?.reply) throw new Error('No response. Try again.');
  return data.reply;
}
