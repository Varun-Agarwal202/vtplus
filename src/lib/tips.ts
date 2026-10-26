import type { FactorId, Insight } from './insights';
import { TASK_PHRASE, TRIGGER_LABEL, type HardTask, type Profile, type Trigger } from './profile';

/**
 * Practical, non-prescriptive tips that people with essential tremor and
 * similar conditions commonly find helpful, plus "talk to your doctor" signs.
 * Nothing here changes medication; every tip is framed as something to try
 * and compare in the app.
 */

export type TipCategory = 'sleep' | 'food' | 'stress' | 'daily' | 'phone' | 'movement' | 'doctor';

export const CATEGORY_LABEL: Record<TipCategory, string> = {
  sleep: 'Sleep',
  food: 'Food & drink',
  stress: 'Stress',
  daily: 'Everyday tasks',
  phone: 'Phone & typing',
  movement: 'Body & exercise',
  doctor: 'Your doctor',
};

export type TipRoute = '/breathe' | '/accessibility' | '/summary' | '/(tabs)';

export interface Tip {
  id: string;
  category: TipCategory;
  title: string;
  body: string;
  steps?: string[];
  /** the personal pattern this tip responds to */
  factor?: FactorId;
  action?: { label: string; href: TipRoute };
}

export const TIPS: Tip[] = [
  /* sleep */
  {
    id: 'sleep-routine',
    category: 'sleep',
    factor: 'sleep',
    title: 'Consistent sleep schedule',
    body: 'Being tired is one of the most common things that makes shaking worse. A steady routine often helps more than any single trick.',
    steps: [
      'Go to bed and get up at about the same time every day, weekends too.',
      'Stop screens and bright light 30–60 minutes before bed.',
      'Keep the bedroom cool, dark and quiet.',
      'Avoid caffeine after midday and heavy meals late at night.',
      'Tag your sleep after each reading so the app can show if it matters for you.',
    ],
  },
  {
    id: 'sleep-same-time',
    category: 'sleep',
    title: 'Measure at the same time daily',
    body: 'Tremor changes through the day. Comparing a morning reading with an evening one can look like a change when it isn’t. Pick a regular time. A daily reminder is in Settings.',
  },
  {
    id: 'sleep-nap',
    category: 'sleep',
    title: 'Rest before precise tasks',
    body: 'If you have something fiddly coming up, like signing papers or a meal out, a short rest or a 20-minute nap beforehand can help some people.',
  },

  /* food & drink */
  {
    id: 'caffeine-check',
    category: 'food',
    factor: 'caffeine',
    title: 'Track caffeine intake',
    body: 'Coffee, tea, energy drinks, cola and some cold and headache medicines contain stimulants that can increase shaking.',
    steps: [
      'Tag caffeine yes or no every time you measure.',
      'Try cutting back for a week, or switching to decaf after midday.',
      'Cut down gradually. Stopping suddenly can cause headaches.',
      'Compare your readings in Insights after a week or two.',
    ],
  },
  {
    id: 'alcohol-caution',
    category: 'food',
    title: 'Alcohol and tremor',
    body: 'Some people notice a drink briefly calms their tremor, but the effect wears off and shaking can come back stronger the next day. It isn’t a treatment. If you find yourself relying on it, tell your doctor. There are better options.',
  },
  {
    id: 'regular-meals',
    category: 'food',
    title: 'Regular meals',
    body: 'Low blood sugar can cause shakiness or make a tremor worse. Eat regularly and keep a snack nearby on busy days. Drinking enough water helps too.',
  },
  {
    id: 'drinking-easier',
    category: 'food',
    title: 'Drinking aids',
    body: 'Small changes stop spills and make you more confident eating with others.',
    steps: [
      'Use heavier mugs, or cups with lids and a long straw.',
      'Fill cups only halfway.',
      'Hold the cup with both hands, elbows resting on the table.',
      'Bring your head down to the cup rather than lifting the cup high.',
    ],
  },
  {
    id: 'utensils',
    category: 'food',
    title: 'Weighted utensils',
    body: 'Extra weight damps shaking for many people, and thicker handles are easier to grip. Some stabilising spoons actively cancel out movement.',
    steps: [
      'Try weighted cutlery, or wrap handles in foam tubing for a thicker grip.',
      'Rest your elbows on the table while eating.',
      'Use plates with a raised rim or a plate guard, and a non-slip mat.',
      'Cut food into smaller pieces before you start, or ask for it cut.',
    ],
  },

  /* stress */
  {
    id: 'breathing',
    category: 'stress',
    factor: 'stress',
    title: 'Paced breathing',
    body: 'Stress and adrenaline amplify tremor. A few minutes of slow breathing, longer out than in, can take the edge off before signing, eating out, or a doctor’s visit.',
    action: { label: 'Start breathing exercise', href: '/breathe' },
  },
  {
    id: 'stress-plan',
    category: 'stress',
    factor: 'stress',
    title: 'Managing stress in public',
    body: 'Being watched or rushed makes most tremors worse, which can make you more anxious, and so on in a loop. Breaking it helps.',
    steps: [
      'Do fiddly tasks when you’re not in a hurry.',
      'Telling people “I have a tremor” often makes it less noticeable, not more.',
      'Ask for a pen with a bigger grip, a cup with a lid, or an extra minute. It’s a reasonable request.',
    ],
  },

  /* everyday tasks */
  {
    id: 'anchor',
    category: 'daily',
    title: 'Bracing your arm',
    body: 'The closer your hand is to something solid, the less it moves.',
    steps: [
      'Keep elbows tucked in against your body.',
      'Rest your forearm or wrist on a table while you work.',
      'Use both hands together for things like holding a phone or a cup.',
    ],
  },
  {
    id: 'wrist-weights',
    category: 'daily',
    title: 'Wrist weights',
    body: 'A light wrist weight (around half a kilo / 1 lb) can steady the hand for some tasks. Too heavy tires you out, so start light and only for short periods.',
  },
  {
    id: 'writing',
    category: 'daily',
    title: 'Writing and signing',
    body: 'Handwriting is often the hardest task.',
    steps: [
      'Use a thick, heavy or weighted pen, or a rubber grip.',
      'Write larger and slower, and print instead of joined-up writing.',
      'Use a clipboard or non-slip mat so the paper doesn’t move.',
      'Ask if a typed form, e-signature or stamp is accepted.',
    ],
  },
  {
    id: 'dressing',
    category: 'daily',
    title: 'Dressing and grooming',
    body: 'Small tools save a lot of frustration.',
    steps: [
      'Button hooks, magnetic buttons, or clothes with zips and Velcro.',
      'Slip-on shoes or elastic laces.',
      'An electric razor and electric toothbrush.',
      'Sit down and rest your elbows on the counter for make-up or shaving.',
    ],
  },
  {
    id: 'ot',
    category: 'daily',
    title: 'Occupational therapy',
    body: 'An occupational therapist can look at the tasks you find hardest and suggest tools and techniques for your situation. Ask your doctor for a referral.',
  },

  /* phone */
  {
    id: 'app-settings',
    category: 'phone',
    title: 'In-app accessibility settings',
    body: 'Bigger buttons, ignoring accidental double taps, larger text and spoken instructions are all in Accessibility.',
    action: { label: 'Open accessibility settings', href: '/accessibility' },
  },
  {
    id: 'iphone-touch',
    category: 'phone',
    title: 'iPhone: Touch Accommodations',
    body: 'iPhone can ignore shaky or repeated touches across every app.',
    steps: [
      'Open Settings, then Accessibility, then Touch.',
      'Tap Touch Accommodations and turn it on.',
      'Turn on Hold Duration so a touch only counts after a short hold.',
      'Turn on Ignore Repeat so quick double touches count once.',
      'Under Touch, also try turning off Shake to Undo.',
    ],
  },
  {
    id: 'android-touch',
    category: 'phone',
    title: 'Android: Touch and hold delay',
    body: 'Most Android phones can be made more forgiving of shaky touches. Names vary a little by brand.',
    steps: [
      'Open Settings, then Accessibility.',
      'Look for Interaction controls, Timing controls, or Interaction and dexterity.',
      'Set Touch and hold delay to Long.',
      'If you see Ignore repeated touches, turn it on.',
    ],
  },
  {
    id: 'voice',
    category: 'phone',
    title: 'Voice input',
    body: 'Dictation (the microphone on your keyboard) is often faster and less tiring than typing. Voice Control on iPhone and Voice Access on Android can run the whole phone by voice. A stylus or a bigger keyboard can help too.',
  },

  /* body */
  {
    id: 'exercise',
    category: 'movement',
    title: 'Exercise and grip strength',
    body: 'Regular exercise improves sleep and stress, both linked to tremor. Some people find forearm and grip strengthening makes tasks easier. A physiotherapist can suggest safe exercises.',
  },
  {
    id: 'warm',
    category: 'movement',
    title: 'Cold hands',
    body: 'Cold makes muscles shake more. Gloves outdoors and warming your hands before a fiddly task can help.',
  },
  {
    id: 'best-time',
    category: 'movement',
    factor: 'timeOfDay',
    title: 'Schedule tasks around your lowest readings',
    body: 'If Insights shows a time of day when your readings are lower, try to schedule writing, cooking or appointments then.',
  },

  /* doctor */
  {
    id: 'see-doctor',
    category: 'doctor',
    title: 'When to see a doctor',
    body: 'See a doctor if your tremor is new or changing, especially if:',
    steps: [
      'It started suddenly, or after starting a new medicine.',
      'It is on one side only, or mainly happens when your hand is resting.',
      'It comes with stiffness, slowness, balance problems, or changes in walking, speech or handwriting size.',
      'It’s affecting your work, eating, or mood.',
      'Get urgent help if shaking comes with sudden weakness, numbness, confusion or trouble speaking.',
    ],
  },
  {
    id: 'bring-summary',
    category: 'doctor',
    factor: 'meds',
    title: 'Share readings with your doctor',
    body: 'A few weeks of readings show your doctor more than a single moment in the clinic. Make a one-page PDF to share.',
    action: { label: 'Create summary PDF', href: '/summary' },
  },
  {
    id: 'med-timing',
    category: 'doctor',
    factor: 'medsTiming',
    title: 'Log medication times',
    body: 'When you take a tremor medicine, tag “took my medication” and type the time. Insights can then show when your readings are lowest after a dose, which is useful when discussing timing with your doctor. Never change a dose on your own.',
  },
  {
    id: 'med-review',
    category: 'doctor',
    title: 'Medication review',
    body: 'Some medicines and supplements can cause or worsen shaking, for example some asthma inhalers, antidepressants, thyroid tablets and decongestants. A pharmacist or doctor can check yours. Don’t stop anything without asking first.',
  },
];

export interface Recommendation {
  tip: Tip;
  /** why it's suggested: always about this user's own data or profile */
  reason: string;
  /** what the reason is based on, for the little label */
  basis: 'readings' | 'profile';
}

export interface TipContext {
  insights: Insight[];
  profile: Profile;
  /** last 7 days vs. earlier, relative (0.25 = 25% more movement); null if unknown */
  recentChange?: number | null;
  totalSessions?: number;
  /** share of sessions with a medication time logged, when the user takes meds */
  medsTimeLogged?: boolean;
  platform?: 'ios' | 'android' | 'other';
}

const TASK_TIPS: Record<HardTask, string[]> = {
  eating: ['utensils', 'anchor'],
  drinking: ['drinking-easier'],
  writing: ['writing'],
  phone: ['PLATFORM_TOUCH', 'voice', 'app-settings'],
  dressing: ['dressing'],
  work: ['ot', 'anchor'],
  social: ['stress-plan', 'breathing'],
};

const TRIGGER_TIPS: Record<Trigger, string> = {
  caffeine: 'caffeine-check',
  stress: 'breathing',
  sleep: 'sleep-routine',
  alcohol: 'alcohol-caution',
  cold: 'warm',
  tiredness: 'sleep-nap',
  hunger: 'regular-meals',
};

const TRIGGER_FACTOR: Partial<Record<Trigger, FactorId>> = { caffeine: 'caffeine', stress: 'stress', sleep: 'sleep' };

/**
 * Tips chosen for this person, strongest reason first. Every recommendation
 * carries a reason drawn from their readings or what they told us; there are
 * no blanket defaults. Returns fewer than `limit` (even none) rather than pad.
 */
export function recommendTips(ctx: TipContext, limit = 4): Recommendation[] {
  const { insights, profile } = ctx;
  const platform = ctx.platform ?? 'other';
  const scored = new Map<string, { score: number; reason: string; basis: Recommendation['basis'] }>();
  const offer = (id: string, score: number, reason: string, basis: Recommendation['basis']) => {
    const realId = id === 'PLATFORM_TOUCH' ? (platform === 'android' ? 'android-touch' : 'iphone-touch') : id;
    const cur = scored.get(realId);
    if (!cur || cur.score < score) scored.set(realId, { score, reason, basis });
  };

  // 1. what the readings show
  const real = insights.filter((i) => i.direction !== 'same');
  for (const ins of real) {
    const strength = Math.abs(ins.rel);
    if (ins.factor === 'timeOfDay') {
      offer('best-time', 90 + strength * 100, `Your readings are lowest ${ins.lowerGroup}.`, 'readings');
      continue;
    }
    if (ins.factor === 'medsTiming') {
      offer('bring-summary', 85 + strength * 100, `Readings were lowest ${ins.lowerGroup}.`, 'readings');
      continue;
    }
    if (ins.direction !== 'higher') continue;
    for (const tip of TIPS.filter((t) => t.factor === ins.factor)) offer(tip.id, 100 + strength * 100, ins.sentence, 'readings');
  }

  if (ctx.recentChange !== undefined && ctx.recentChange !== null && ctx.recentChange >= 0.2) {
    const pct = Math.round(ctx.recentChange * 100);
    offer('breathing', 95, `Readings over the last 7 days are ${pct}% higher than before.`, 'readings');
    offer('sleep-routine', 80, `Readings over the last 7 days are ${pct}% higher than before.`, 'readings');
    if (ctx.recentChange >= 0.35) offer('see-doctor', 92, `Readings are up ${pct}% this week. Worth mentioning to your doctor if it continues.`, 'readings');
  }

  // 2. what they told us
  for (const task of profile.hardTasks) {
    TASK_TIPS[task].forEach((id, k) => offer(id, 70 - k * 5, `You listed ${TASK_PHRASE[task]} as difficult.`, 'profile'));
  }
  for (const trig of profile.triggers) {
    const factor = TRIGGER_FACTOR[trig];
    const tested = factor ? insights.find((i) => i.factor === factor) : undefined;
    if (tested?.direction === 'higher') continue; // already covered with real numbers
    const reason =
      tested?.direction === 'same'
        ? `Listed as a trigger. No clear difference in your readings so far.`
        : factor
          ? `Listed as a trigger. Tag ${TRIGGER_LABEL[trig].toLowerCase()} on readings to check.`
          : `${TRIGGER_LABEL[trig]} is listed as a trigger.`;
    offer(TRIGGER_TIPS[trig], tested?.direction === 'same' ? 40 : 60, reason, 'profile');
  }
  if (profile.takesMeds) {
    const med = profile.medName ?? 'your medication';
    if (!ctx.medsTimeLogged) offer('med-timing', 65, `Log dose times to see how readings change after ${med}.`, 'profile');
    offer('med-review', 30, `You take ${med}.`, 'profile');
  }
  if (profile.condition === 'unsure') offer('see-doctor', 75, 'Tremor type not yet diagnosed.', 'profile');
  if (profile.condition === 'parkinsons') offer('exercise', 68, 'Exercise is well supported for Parkinson’s.', 'profile');
  if (profile.condition === 'dystonic') offer('ot', 62, 'Often helpful for dystonic tremor.', 'profile');
  if ((ctx.totalSessions ?? 0) >= 10) offer('bring-summary', 45, `${ctx.totalSessions} readings recorded.`, 'readings');

  return [...scored.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .flatMap(([id, v]) => {
      const tip = TIPS.find((t) => t.id === id);
      return tip ? [{ tip, reason: v.reason, basis: v.basis }] : [];
    });
}

export function tipsByCategory(): { category: TipCategory; label: string; tips: Tip[] }[] {
  const order: TipCategory[] = ['sleep', 'food', 'stress', 'daily', 'phone', 'movement', 'doctor'];
  return order.map((c) => ({ category: c, label: CATEGORY_LABEL[c], tips: TIPS.filter((t) => t.category === c) }));
}
