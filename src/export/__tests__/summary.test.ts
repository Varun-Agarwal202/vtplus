import type { Session } from '@/db/types';
import { DISCLAIMER_SENTENCE, buildSummaryHtml } from '../summary';

function session(over: Partial<Session>): Session {
  return {
    id: Math.random().toString(36).slice(2),
    startedAt: '2026-10-01T08:00:00.000Z',
    durationS: 26,
    position: 'rest',
    measuredFsHz: 100,
    jitter: 0.05,
    dominantHz: 6,
    dominantHzInterp: 6.02,
    bandPower: 1e-5,
    rmsG: 0.01,
    peakRatio: 0.8,
    spectralEntropy: 0.4,
    lfMotionRmsG: 0.001,
    qualityFlags: [],
    analysisMode: 'axes',
    sleep: null,
    stress: null,
    caffeine: null,
    medsTaken: null,
    medsTime: null,
    notes: null,
    deviceModel: 'iPhone',
    appVersion: '0.1.0',
    rawPath: null,
    spectrumJson: null,
    ...over,
  };
}

describe('clinician summary HTML', () => {
  const sessions = [
    session({ startedAt: '2026-10-01T08:00:00.000Z', dominantHz: 6, rmsG: 0.01 }),
    session({ startedAt: '2026-10-05T08:00:00.000Z', dominantHz: 6.25, rmsG: 0.012, medsTaken: true, medsTime: '07:30' }),
    session({ startedAt: '2026-10-09T08:00:00.000Z', position: 'postural', dominantHz: 7, rmsG: 0.02, notes: 'tired <b>day</b>' }),
  ];

  test('contains the disclaimer, per-position stats, both charts and escaped notes', () => {
    const html = buildSummaryHtml({ sessions, units: 'g', rangeLabel: 'Oct 2026', appVersion: '0.1.0', deviceModel: 'iPhone' });
    expect(html).toContain(DISCLAIMER_SENTENCE);
    expect(html).toContain('Self-tracked, non-diagnostic');
    expect(html).toContain('Rest');
    expect(html).toContain('Postural');
    expect((html.match(/<svg/g) ?? []).length).toBe(2);
    expect(html).toContain('tired &lt;b&gt;day&lt;/b&gt;');
    expect(html).not.toContain('<b>day</b>');
    // medication appears only as a logged entry with the user's time
    expect(html).toContain('meds logged 07:30');
    expect(html).not.toMatch(/dose|dosing|mg\b/i);
  });

  test('uses m/s² when asked', () => {
    const html = buildSummaryHtml({ sessions, units: 'ms2', rangeLabel: 'x', appVersion: '0.1.0', deviceModel: null });
    expect(html).toContain('amplitude unit: m/s²');
    expect(html).toContain('0.098'); // 0.01 g in m/s²
  });

  test('handles an empty range', () => {
    const html = buildSummaryHtml({ sessions: [], units: 'g', rangeLabel: 'none', appVersion: '0.1.0', deviceModel: null });
    expect(html).toContain('No sessions in this range');
  });
});
