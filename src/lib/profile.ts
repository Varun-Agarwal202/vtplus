/**
 * What the user tells us about themselves. Synced with their account (it lives
 * inside the settings JSON) and used to pick tips and to brief the AI coach.
 */

export type Condition = 'essential' | 'parkinsons' | 'dystonic' | 'other' | 'unsure';
export type Hand = 'left' | 'right' | 'both';
export type HardTask = 'eating' | 'drinking' | 'writing' | 'phone' | 'dressing' | 'work' | 'social';
export type Trigger = 'caffeine' | 'stress' | 'sleep' | 'alcohol' | 'cold' | 'tiredness' | 'hunger';

export interface Profile {
  name: string | null;
  condition: Condition | null;
  hand: Hand | null;
  hardTasks: HardTask[];
  /** what the user suspects makes it worse */
  triggers: Trigger[];
  takesMeds: boolean | null;
  medName: string | null;
  onboarded: boolean;
}

export const EMPTY_PROFILE: Profile = {
  name: null,
  condition: null,
  hand: null,
  hardTasks: [],
  triggers: [],
  takesMeds: null,
  medName: null,
  onboarded: false,
};

export const CONDITION_LABEL: Record<Condition, string> = {
  essential: 'Essential tremor',
  parkinsons: 'Parkinson’s',
  dystonic: 'Dystonic tremor',
  other: 'Something else',
  unsure: 'Not sure yet',
};

export const HAND_LABEL: Record<Hand, string> = { left: 'Left', right: 'Right', both: 'Both' };

export const TASK_LABEL: Record<HardTask, string> = {
  eating: 'Eating',
  drinking: 'Drinking',
  writing: 'Writing',
  phone: 'Using my phone',
  dressing: 'Buttons & dressing',
  work: 'Work tasks',
  social: 'Being around people',
};

/** lower-case phrasing for sentences: "You said writing is hard" */
export const TASK_PHRASE: Record<HardTask, string> = {
  eating: 'eating',
  drinking: 'drinking',
  writing: 'writing',
  phone: 'using your phone',
  dressing: 'buttons and dressing',
  work: 'work tasks',
  social: 'being around people',
};

export const TRIGGER_LABEL: Record<Trigger, string> = {
  caffeine: 'Caffeine',
  stress: 'Stress',
  sleep: 'Poor sleep',
  alcohol: 'Alcohol',
  cold: 'Cold',
  tiredness: 'Tiredness',
  hunger: 'Skipping meals',
};

const CONDITIONS = Object.keys(CONDITION_LABEL) as Condition[];
const HANDS = Object.keys(HAND_LABEL) as Hand[];
const TASKS = Object.keys(TASK_LABEL) as HardTask[];
const TRIGGERS = Object.keys(TRIGGER_LABEL) as Trigger[];

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t.length ? t : null;
}

export function parseProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROFILE };
  const v = raw as Record<string, unknown>;
  return {
    name: cleanText(v.name, 40),
    condition: CONDITIONS.includes(v.condition as Condition) ? (v.condition as Condition) : null,
    hand: HANDS.includes(v.hand as Hand) ? (v.hand as Hand) : null,
    hardTasks: Array.isArray(v.hardTasks) ? TASKS.filter((t) => (v.hardTasks as unknown[]).includes(t)) : [],
    triggers: Array.isArray(v.triggers) ? TRIGGERS.filter((t) => (v.triggers as unknown[]).includes(t)) : [],
    takesMeds: typeof v.takesMeds === 'boolean' ? v.takesMeds : null,
    medName: cleanText(v.medName, 60),
    onboarded: v.onboarded === true,
  };
}

export function firstName(p: Profile): string | null {
  return p.name ? p.name.split(/\s+/)[0] : null;
}
