import type { InsightSession } from '../insights';
import { greeting, latestMilestone, latestVsUsual, recentVsEarlier, relPhrase, weekRecap } from '../personal';

const NOW = new Date('2026-03-15T12:00:00');

function s(daysAgo: number, rmsG: number, extra: Partial<InsightSession> = {}): InsightSession {
  const d = new Date(NOW.getTime() - daysAgo * 24 * 3600 * 1000);
  return { startedAt: d.toISOString(), position: 'rest', rmsG, sleep: null, stress: null, caffeine: null, medsTaken: null, medsTime: null, ...extra };
}

test('greeting uses the time of day and the name', () => {
  expect(greeting('Sam', new Date('2026-03-15T08:00:00'))).toBe('Good morning, Sam');
  expect(greeting(null, new Date('2026-03-15T19:00:00'))).toBe('Good evening');
});

test('latest vs usual compares within the same position', () => {
  const r = latestVsUsual([s(0, 0.05), s(1, 0.1), s(2, 0.1), s(3, 0.1), s(0.5, 1, { position: 'postural' })]);
  expect(r?.rel).toBeCloseTo(-0.5, 5);
  expect(latestVsUsual([s(0, 0.05), s(1, 0.1)])).toBeNull();
});

test('recent vs earlier needs enough of both', () => {
  const earlier = [10, 11, 12, 13, 14].map((d) => s(d, 0.1));
  const recent = [1, 2, 3].map((d) => s(d, 0.2));
  expect(recentVsEarlier([...earlier, ...recent], NOW)).toBeGreaterThan(0.5);
  expect(recentVsEarlier(recent, NOW)).toBeNull();
});

test('week recap counts and compares weeks', () => {
  const r = weekRecap([s(1, 0.1, { sleep: 'good' }), s(2, 0.1), s(8, 0.2), s(9, 0.2)], NOW);
  expect(r.count).toBe(2);
  expect(r.lastWeekCount).toBe(2);
  expect(r.change).toBeLessThan(0);
  expect(r.taggedCount).toBe(1);
});

test('relPhrase and milestones', () => {
  expect(relPhrase(-0.2)).toBe('20% lower than usual');
  expect(relPhrase(0.03)).toBe('Similar to usual');
  expect(latestMilestone(12, 2)?.label).toBe('10 readings');
  expect(latestMilestone(3, 8)?.label).toBe('8-day streak');
  expect(latestMilestone(0, 0)).toBeNull();
});
