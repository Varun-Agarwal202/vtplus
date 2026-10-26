/**
 * In-memory hand-off between the Record screen and the Result screen.
 * A 30 s recording is ~3000 samples; far too big for route params, and it
 * should never touch disk unless the user saves it.
 */
import type { AnalysisResult } from '@/dsp/types';
import type { Recording } from '@/sensors/recorder';
import type { Position } from '@/db/types';

export interface PendingRecording {
  recording: Recording;
  position: Position;
  result: AnalysisResult;
}

let pending: PendingRecording | null = null;

export function setPendingRecording(p: PendingRecording | null): void {
  pending = p;
}

export function getPendingRecording(): PendingRecording | null {
  return pending;
}
