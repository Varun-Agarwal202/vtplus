import { LEVELS, changeFor, frequencyPhrase, historySentence, interpret, levelFor, rhythmFor, scalePosition, steadinessFor, trendSentence } from '../interpret';

describe('levels', () => {
  it('bands are ordered and cover the range', () => {
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].min).toBeGreaterThan(LEVELS[i - 1].min);
    expect(levelFor(0).id).toBe('very_low');
    expect(levelFor(0.014).id).toBe('very_low');
    expect(levelFor(0.015).id).toBe('low');
    expect(levelFor(0.05).id).toBe('moderate');
    expect(levelFor(0.12).id).toBe('high');
    expect(levelFor(1).id).toBe('very_high');
  });

  it('scale position is monotonic in 0..1', () => {
    let prev = -1;
    for (const v of [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.2, 0.3, 1, 5]) {
      const p = scalePosition(v);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(scalePosition(0.015)).toBeCloseTo(0.2, 6);
    expect(scalePosition(0.1)).toBeCloseTo(0.6, 6);
  });
});

describe('phrases', () => {
  it('frequency reads naturally', () => {
    expect(frequencyPhrase(6.02)).toBe('about 6 times a second');
    expect(frequencyPhrase(5.5)).toBe('about 5.5 times a second');
    expect(frequencyPhrase(10.26)).toBe('about 10.3 times a second');
  });

  it('rhythm follows the peak ratio', () => {
    expect(rhythmFor(0.8, 0.5).label).toBe('One clear rhythm');
    expect(rhythmFor(0.4, 0.5).label).toBe('Fairly regular');
    expect(rhythmFor(0.2, 0.5).label).toBe('Irregular');
    expect(rhythmFor(0.05, 0.95).label).toBe('No clear rhythm');
  });

  it('change wording', () => {
    expect(changeFor(0.09, 0.1, 'rest')?.short).toBe('10% less');
    expect(changeFor(0.1, 0.1, 'rest')?.direction).toBe('same');
    expect(changeFor(0.13, 0.1, 'rest')?.sentence).toBe('30% more movement than your last rest session.');
    expect(changeFor(0.1, 0, 'rest')).toBeNull();
  });
});

describe('steadiness', () => {
  it('detects easing off, building up, steady and bursty', () => {
    expect(steadinessFor([1, 1, 1, 0.5, 0.5, 0.5, 0.2, 0.2, 0.2])?.label).toBe('Eased off');
    expect(steadinessFor([0.2, 0.2, 0.2, 0.5, 0.5, 0.5, 1, 1, 1])?.label).toBe('Built up');
    expect(steadinessFor([1, 1.05, 0.95, 1, 1.02, 0.98, 1, 1, 1])?.label).toBe('Steady throughout');
    expect(steadinessFor([1, 0.1, 1, 0.1, 1, 0.1, 1, 0.1, 1])?.label).toBe('Came and went');
    expect(steadinessFor([1, 2, 3])).toBeNull();
  });
});

describe('history and trend', () => {
  it('history sentence needs three or more sessions', () => {
    expect(historySentence(0.05, [0.1, 0.2], 'rest')).toBeNull();
    expect(historySentence(0.05, [0.1, 0.2, 0.3, 0.4, 0.5], 'rest')).toMatch(/Lower than 100%/);
    expect(historySentence(0.6, [0.1, 0.2, 0.3, 0.4, 0.5], 'rest')).toMatch(/Higher than 100%/);
    expect(historySentence(0.3, [0.1, 0.2, 0.25, 0.4, 0.5], 'rest')).toMatch(/middle/);
  });

  it('trend sentence compares early and late medians', () => {
    const down = [1, 1, 1, 0.5, 0.5, 0.5].map((v, i) => ({ t: i, v }));
    expect(trendSentence(down, 'rest', 30)).toMatch(/50% lower/);
    const flat = [1, 1.02, 0.98, 1, 1.01, 0.99].map((v, i) => ({ t: i, v }));
    expect(trendSentence(flat, 'rest', null)).toMatch(/steady/);
    expect(trendSentence(down.slice(0, 3), 'rest', 30)).toBeNull();
  });
});

describe('interpret', () => {
  it('builds a headline and comparison', () => {
    const r = interpret({
      position: 'rest',
      rmsG: 0.06,
      dominantHz: 5.98,
      peakRatio: 0.7,
      spectralEntropy: 0.4,
      rmsTimeline: [0.06, 0.06, 0.06, 0.06, 0.06, 0.06],
      previous: { rmsG: 0.08, dominantHz: 6.1 },
      history: [0.08, 0.09, 0.1],
    });
    expect(r.headline).toBe('Noticeable hand movement, about 6 times a second.');
    expect(r.change?.short).toBe('25% less');
    expect(r.frequencyChange).toMatch(/unchanged/);
    expect(r.history).toMatch(/calmest/);
    expect(r.rhythm.label).toBe('One clear rhythm');
    expect(r.steadiness?.label).toBe('Steady throughout');
  });

  it('works with no history', () => {
    const r = interpret({ position: 'postural', rmsG: 0.01, dominantHz: 8.4, peakRatio: 0.1, spectralEntropy: 0.95 });
    expect(r.level.id).toBe('very_low');
    expect(r.change).toBeNull();
    expect(r.history).toBeNull();
    expect(r.steadiness).toBeNull();
  });
});
