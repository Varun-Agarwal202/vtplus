import type { AnalysisMode, QualityFlag } from '@/dsp/types';

export type Position = 'rest' | 'postural' | 'kinetic';
export type Sleep = 'poor' | 'ok' | 'good';

export const POSITIONS: Position[] = ['rest', 'postural', 'kinetic'];

export const POSITION_LABEL: Record<Position, string> = {
  rest: 'Rest',
  postural: 'Postural',
  kinetic: 'Kinetic',
};

export const POSITION_SHORT: Record<Position, string> = {
  rest: 'Arm resting, hand relaxed',
  postural: 'Arm held straight out',
  kinetic: 'Hand moving nose to arm’s length',
};

export const POSITION_HELP: Record<Position, string> = {
  rest: 'Sit down. Rest your forearm on your lap or a table, palm up, with the phone lying flat in your hand. Let the hand relax completely.',
  postural: 'Hold the phone in your hand with your arm stretched straight out in front of you, palm down. Keep the arm still against gravity.',
  kinetic: 'Hold the phone and slowly move your hand back and forth between your nose and arm\'s length, like a finger-to-nose test.',
};

export interface SessionTags {
  sleep: Sleep | null;
  /** 1-5 */
  stress: number | null;
  caffeine: boolean | null;
  medsTaken: boolean | null;
  /** ISO time string entered by the user (log data only) */
  medsTime: string | null;
  notes: string | null;
}

export interface Session extends SessionTags {
  id: string;
  startedAt: string;
  durationS: number;
  position: Position;
  measuredFsHz: number;
  jitter: number;
  dominantHz: number;
  dominantHzInterp: number;
  bandPower: number;
  rmsG: number;
  peakRatio: number;
  spectralEntropy: number;
  lfMotionRmsG: number;
  qualityFlags: QualityFlag[];
  analysisMode: AnalysisMode;
  deviceModel: string | null;
  appVersion: string | null;
  /** file URI of the raw CSV, when saved in dev mode */
  rawPath: string | null;
  /** JSON-encoded compact spectrum [f0, df, psd...] for the detail view */
  spectrumJson: string | null;
}

export type NewSession = Omit<Session, 'id'>;

export const EMPTY_TAGS: SessionTags = {
  sleep: null,
  stress: null,
  caffeine: null,
  medsTaken: null,
  medsTime: null,
  notes: null,
};
