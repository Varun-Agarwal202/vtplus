import { useEffect, useState } from 'react';

import { useRepository } from '@/data/repository-context';
import type { Position, Session } from '@/db/types';
import type { AnalysisMode } from '@/dsp/types';

export interface Comparison {
  /** most recent earlier session in the same position and mode */
  previous: Session | null;
  /** amplitudes (g) of up to 50 earlier sessions in the same position and mode */
  history: number[];
  loaded: boolean;
}

/** Earlier sessions to compare a reading against. `before` is an ISO timestamp. */
export function useComparison(position: Position, mode: AnalysisMode, before: string): Comparison {
  const repo = useRepository();
  const [state, setState] = useState<Comparison>({ previous: null, history: [], loaded: false });
  useEffect(() => {
    let alive = true;
    repo
      .listSessions({ position, analysisMode: mode, until: before, limit: 50 })
      .then((rows) => {
        if (!alive) return;
        setState({ previous: rows[0] ?? null, history: rows.map((r) => r.rmsG), loaded: true });
      })
      .catch(() => alive && setState({ previous: null, history: [], loaded: true }));
    return () => {
      alive = false;
    };
  }, [repo, position, mode, before]);
  return state;
}
