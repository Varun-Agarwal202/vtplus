import type { Session } from '@/db/types';
import { buildCoachContext } from '../coach';
import { EMPTY_PROFILE } from '../profile';

jest.mock('../supabase', () => ({ supabaseConfigured: false, getSupabase: jest.fn() }));

const session = (over: Partial<Session> = {}): Session =>
  ({
    id: 'x',
    startedAt: '2026-03-14T09:00:00.000Z',
    position: 'rest',
    rmsG: 0.02,
    dominantHz: 5.5,
    sleep: 'poor',
    stress: 4,
    caffeine: true,
    medsTaken: true,
    medsTime: '08:00',
    notes: 'shaky at breakfast',
    ...over,
  }) as Session;

test('coach brief includes the profile, recent readings and tags', () => {
  const text = buildCoachContext({
    profile: { ...EMPTY_PROFILE, name: 'Sam', condition: 'essential', hardTasks: ['writing'], takesMeds: true, medName: 'propranolol', onboarded: true },
    sessions: [session()],
    insights: [],
    recap: { count: 1, lastWeekCount: 0, change: null, steadiestPart: null, taggedCount: 1 },
    recentChange: null,
    streakDays: 1,
    now: new Date('2026-03-15T10:00:00'),
  });
  expect(text).toMatch(/Name: Sam/);
  expect(text).toMatch(/Essential tremor/);
  expect(text).toMatch(/writing/);
  expect(text).toMatch(/propranolol/);
  expect(text).toMatch(/sleep poor, stress 4\/5, caffeine, meds taken at 08:00/);
  expect(text).toMatch(/shaky at breakfast/);
  expect(text).toMatch(/None yet/);
});

test('coach brief without a profile says so', () => {
  const text = buildCoachContext({
    profile: EMPTY_PROFILE,
    sessions: [],
    insights: [],
    recap: { count: 0, lastWeekCount: 0, change: null, steadiestPart: null, taggedCount: 0 },
    recentChange: null,
    streakDays: 0,
  });
  expect(text).toMatch(/No profile filled in yet/);
  expect(text).not.toMatch(/MOST RECENT READINGS/);
});
