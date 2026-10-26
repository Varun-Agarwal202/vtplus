import { parseCsv } from '@/dsp/__tests__/helpers';
import { synth } from '@/dsp/__tests__/synth';
import { analyze } from '@/dsp';
import { G } from '@/lib/units';
import { rawSamplesCsv, sessionsCsv } from '../csv';
import type { Session } from '@/db/types';

describe('rawSamplesCsv (Phyphox layout)', () => {
  const samples = synth({ freq: 6, amp: 0.3, fsRaw: 100, seed: 5, scale: 1 / G });

  test('header matches the Phyphox accelerometer export and values are in m/s²', () => {
    const csv = rawSamplesCsv(samples, 'ms2');
    const [header, first] = csv.split('\n');
    expect(header).toBe('"Time (s)","Acceleration x (m/s^2)","Acceleration y (m/s^2)","Acceleration z (m/s^2)"');
    const cols = first.split(',').map(Number);
    expect(cols).toHaveLength(4);
    expect(cols[0]).toBe(0); // time is re-based to start at 0
    // gravity on z: ~9.81 m/s²
    expect(Math.abs(cols[3] - 9.81)).toBeLessThan(0.5);
  });

  test('parsing the CSV back and analysing gives the same result as the in-app analysis', () => {
    const csv = rawSamplesCsv(samples, 'ms2');
    const back = parseCsv(csv);
    expect(back).toHaveLength(samples.length);
    const fromCsv = analyze(back); // m/s²
    const inApp = analyze(samples); // g
    expect(fromCsv.dominantHz).toBe(inApp.dominantHz);
    // 6-decimal rounding in the CSV -> tiny differences only
    expect(Math.abs(fromCsv.rms - inApp.rms * G) / (inApp.rms * G)).toBeLessThan(1e-4);
  });

  test('units="g" keeps g and labels the header accordingly', () => {
    const csv = rawSamplesCsv(samples, 'g');
    expect(csv.split('\n')[0]).toContain('(g)');
    const z = Number(csv.split('\n')[1].split(',')[3]);
    expect(Math.abs(z - 1)).toBeLessThan(0.1);
  });
});

describe('sessionsCsv', () => {
  const session: Session = {
    id: 'abc',
    startedAt: '2026-10-12T08:00:00.000Z',
    durationS: 26,
    position: 'rest',
    measuredFsHz: 99.5,
    jitter: 0.1,
    dominantHz: 6,
    dominantHzInterp: 6.05,
    bandPower: 1e-5,
    rmsG: 0.01,
    peakRatio: 0.8,
    spectralEntropy: 0.4,
    lfMotionRmsG: 0.001,
    qualityFlags: ['weak_peak'],
    analysisMode: 'axes',
    sleep: 'ok',
    stress: 3,
    caffeine: true,
    medsTaken: true,
    medsTime: '08:30',
    notes: 'said "hi", then left',
    deviceModel: 'iPhone',
    appVersion: '0.1.0',
    rawPath: null,
    spectrumJson: null,
  };

  test('escapes quotes/commas and converts units', () => {
    const csv = sessionsCsv([session], 'ms2');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('# amplitude unit: m/s²');
    expect(lines[1]).toContain('rms_ms2');
    const row = lines[2];
    expect(row).toContain('"said ""hi"", then left"');
    expect(row).toContain((0.01 * G).toFixed(6));
    expect(row).toContain('weak_peak');
  });
});
