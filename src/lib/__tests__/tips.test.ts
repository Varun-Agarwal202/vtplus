import type { Insight } from '../insights';
import { EMPTY_PROFILE } from '../profile';
import { TIPS, recommendTips, tipsByCategory, type TipContext } from '../tips';

function insight(p: Partial<Insight>): Insight {
  return {
    factor: 'caffeine',
    title: 'Caffeine',
    sentence: 'Your readings after caffeine were 40% higher than without caffeine.',
    rel: 0.4,
    direction: 'higher',
    confidence: 'some',
    counts: [4, 4],
    higherGroup: 'after caffeine',
    lowerGroup: 'without caffeine',
    ...p,
  };
}

describe('tips library', () => {
  test('ids are unique and every tip has a category with a label', () => {
    const ids = TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const grouped = tipsByCategory();
    expect(grouped.reduce((n, g) => n + g.tips.length, 0)).toBe(TIPS.length);
  });

  test('copy never tells people to change medication on their own', () => {
    for (const t of TIPS) {
      const text = [t.body, ...(t.steps ?? [])].join(' ').toLowerCase();
      expect(text).not.toMatch(/increase your dose|take more|stop taking/);
    }
  });
});

describe('recommendTips', () => {
  const ctx = (p: Partial<TipContext> = {}): TipContext => ({ insights: [], profile: EMPTY_PROFILE, ...p });

  test('no blanket tips: nothing known means nothing recommended', () => {
    expect(recommendTips(ctx(), 4)).toEqual([]);
  });

  test('every recommendation has a reason', () => {
    const recs = recommendTips(ctx({ insights: [insight({})], profile: { ...EMPTY_PROFILE, hardTasks: ['writing'], triggers: ['cold'] } }), 10);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.reason.length > 0)).toBe(true);
  });

  test('readings outrank profile, with the reason from the data', () => {
    const recs = recommendTips(ctx({ insights: [insight({})], profile: { ...EMPTY_PROFILE, hardTasks: ['writing'] } }), 3);
    expect(recs[0].tip.id).toBe('caffeine-check');
    expect(recs[0].basis).toBe('readings');
    expect(recs[0].reason).toMatch(/after caffeine were 40% higher/);
    expect(recs.some((r) => r.tip.id === 'writing' && r.reason === 'You listed writing as difficult.')).toBe(true);
  });

  test('strongest pattern first, "same" findings ignored', () => {
    const recs = recommendTips(
      ctx({
        insights: [
          insight({ factor: 'stress', rel: 0.2, sentence: 'stress' }),
          insight({ factor: 'sleep', rel: 0.6, sentence: 'sleep' }),
          insight({ factor: 'caffeine', rel: 0.02, direction: 'same', sentence: 'same' }),
        ],
      }),
      5,
    );
    expect(recs[0].tip.factor).toBe('sleep');
    expect(recs.some((r) => r.reason === 'same')).toBe(false);
    expect(recs.find((r) => r.tip.factor === 'stress')?.reason).toBe('stress');
  });

  test('a suspected trigger the data does not support is said so', () => {
    const recs = recommendTips(
      ctx({ insights: [insight({ direction: 'same', rel: 0.02 })], profile: { ...EMPTY_PROFILE, triggers: ['caffeine'] } }),
      4,
    );
    expect(recs.find((r) => r.tip.id === 'caffeine-check')?.reason).toMatch(/No clear difference/);
  });

  test('phone difficulty picks the platform tip', () => {
    const profile = { ...EMPTY_PROFILE, hardTasks: ['phone' as const] };
    expect(recommendTips(ctx({ profile, platform: 'ios' }), 6).some((r) => r.tip.id === 'iphone-touch')).toBe(true);
    expect(recommendTips(ctx({ profile, platform: 'android' }), 6).some((r) => r.tip.id === 'android-touch')).toBe(true);
  });

  test('medication: nudges to log the time, naming the medicine', () => {
    const recs = recommendTips(ctx({ profile: { ...EMPTY_PROFILE, takesMeds: true, medName: 'propranolol' } }), 4);
    expect(recs[0].tip.id).toBe('med-timing');
    expect(recs[0].reason).toMatch(/propranolol/);
  });

  test('a rising week suggests breathing and, if large, a doctor', () => {
    const recs = recommendTips(ctx({ recentChange: 0.4 }), 4);
    const ids = recs.map((r) => r.tip.id);
    expect(ids).toContain('breathing');
    expect(ids).toContain('see-doctor');
  });
});
