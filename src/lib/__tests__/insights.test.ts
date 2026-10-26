import { dayPart, findInsights, habitsFor, hoursSinceDose, parseClock, relativeAmplitudes, type InsightSession } from '../insights';

function at(hour: number, day = 1, minute = 0): string {
  return new Date(2026, 0, day, hour, minute).toISOString();
}

function s(p: Partial<InsightSession>): InsightSession {
  return {
    startedAt: at(10),
    position: 'rest',
    rmsG: 0.05,
    sleep: null,
    stress: null,
    caffeine: null,
    medsTaken: null,
    medsTime: null,
    ...p,
  };
}

describe('relativeAmplitudes', () => {
  test('normalises within each position', () => {
    const rows = relativeAmplitudes([
      s({ position: 'rest', rmsG: 0.02 }),
      s({ position: 'rest', rmsG: 0.04 }),
      s({ position: 'postural', rmsG: 0.2 }),
      s({ position: 'postural', rmsG: 0.4 }),
    ]);
    [2 / 3, 4 / 3, 2 / 3, 4 / 3].forEach((v, i) => expect(rows[i].ratio).toBeCloseTo(v, 12));
  });
});

describe('findInsights', () => {
  test('finds a caffeine difference and reports it plainly', () => {
    const sessions = [
      s({ caffeine: true, rmsG: 0.08 }),
      s({ caffeine: true, rmsG: 0.09 }),
      s({ caffeine: false, rmsG: 0.05 }),
      s({ caffeine: false, rmsG: 0.05 }),
    ];
    const caf = findInsights(sessions).find((i) => i.factor === 'caffeine')!;
    expect(caf.direction).toBe('higher');
    expect(caf.rel).toBeCloseTo(0.7, 5);
    expect(caf.sentence).toBe('Your readings after caffeine were 70% higher than without caffeine.');
    expect(caf.confidence).toBe('early');
    expect(caf.counts).toEqual([2, 2]);
  });

  test('needs at least two sessions per side', () => {
    const sessions = [s({ sleep: 'poor', rmsG: 0.1 }), s({ sleep: 'good', rmsG: 0.05 }), s({ sleep: 'good', rmsG: 0.05 })];
    expect(findInsights(sessions).find((i) => i.factor === 'sleep')).toBeUndefined();
  });

  test('small differences are "no clear difference" and sorted last', () => {
    const sessions = [
      s({ stress: 5, rmsG: 0.051 }),
      s({ stress: 4, rmsG: 0.05 }),
      s({ stress: 1, rmsG: 0.05 }),
      s({ stress: 2, rmsG: 0.049 }),
      s({ sleep: 'poor', rmsG: 0.1 }),
      s({ sleep: 'poor', rmsG: 0.1 }),
      s({ sleep: 'good', rmsG: 0.05 }),
      s({ sleep: 'ok', rmsG: 0.05 }),
    ];
    const list = findInsights(sessions);
    const stress = list.find((i) => i.factor === 'stress')!;
    expect(stress.direction).toBe('same');
    expect(list[list.length - 1].direction).toBe('same');
    expect(list[0].factor).toBe('sleep');
  });

  test('time of day picks the steadiest and highest parts of the day', () => {
    const sessions = [
      s({ startedAt: at(8), rmsG: 0.04 }),
      s({ startedAt: at(9, 2), rmsG: 0.04 }),
      s({ startedAt: at(19), rmsG: 0.08 }),
      s({ startedAt: at(20, 2), rmsG: 0.08 }),
    ];
    const tod = findInsights(sessions).find((i) => i.factor === 'timeOfDay')!;
    expect(tod.sentence).toBe('Your steadiest readings were in the morning. Readings in the evening were 100% higher.');
  });

  test('medication timing buckets hours since the logged dose', () => {
    const sessions = [
      s({ medsTaken: true, medsTime: '08:00', startedAt: at(10), rmsG: 0.03 }),
      s({ medsTaken: true, medsTime: '8:00', startedAt: at(11, 2), rmsG: 0.03 }),
      s({ medsTaken: true, medsTime: '8am', startedAt: at(18), rmsG: 0.06 }),
      s({ medsTaken: true, medsTime: '08.00', startedAt: at(19, 2), rmsG: 0.06 }),
    ];
    const t = findInsights(sessions).find((i) => i.factor === 'medsTiming')!;
    expect(t.sentence).toBe('Your readings were lowest 2–4 hours after your medication, and 100% higher over 8 hours after.');
  });
});

describe('clock parsing', () => {
  test.each([
    ['08:30', 8.5],
    ['8.30', 8.5],
    ['8:30pm', 20.5],
    ['12am', 0],
    ['12pm', 12],
    ['20', 20],
    ['nonsense', null],
    ['25:00', null],
  ])('%s', (text, expected) => {
    expect(parseClock(text)).toBe(expected);
  });

  test('hoursSinceDose wraps past midnight and ignores far-off doses', () => {
    expect(hoursSinceDose(s({ medsTaken: true, medsTime: '23:00', startedAt: at(1) }))).toBe(2);
    expect(hoursSinceDose(s({ medsTaken: true, medsTime: '08:00', startedAt: at(7) }))).toBeNull();
    expect(hoursSinceDose(s({ medsTaken: false, medsTime: '08:00' }))).toBeNull();
  });
});

describe('dayPart', () => {
  test('buckets hours', () => {
    expect(dayPart(at(5))).toBe('morning');
    expect(dayPart(at(12))).toBe('afternoon');
    expect(dayPart(at(17))).toBe('evening');
    expect(dayPart(at(23))).toBe('night');
    expect(dayPart(at(3))).toBe('night');
  });
});

describe('habitsFor', () => {
  test('streak counts back from today or yesterday', () => {
    const now = new Date(2026, 0, 10, 12);
    const h = habitsFor(
      [s({ startedAt: at(9, 9) }), s({ startedAt: at(9, 8), caffeine: true }), s({ startedAt: at(9, 7) }), s({ startedAt: at(9, 1) })],
      now,
    );
    expect(h.streakDays).toBe(3);
    expect(h.thisWeek).toBe(3);
    expect(h.taggedShare).toBeCloseTo(0.25);
    expect(h.total).toBe(4);
  });
});
