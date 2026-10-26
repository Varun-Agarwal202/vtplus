import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { useRepository } from '@/data/repository-context';
import type { Session } from '@/db/types';
import { isoDaysAgo } from '@/lib/format';
import { findInsights, habitsFor } from '@/lib/insights';
import { latestVsUsual, recentVsEarlier, weekRecap } from '@/lib/personal';
import { firstName } from '@/lib/profile';
import { recommendTips } from '@/lib/tips';
import { useSettings } from './settings-context';

export const LOOKBACK_DAYS = 90;

/** Everything personal, recomputed whenever a screen using it comes into focus. */
export function usePersonal(tipLimit = 4) {
  const repo = useRepository();
  const { settings } = useSettings();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      repo
        .listSessions({ position: 'all', since: isoDaysAgo(LOOKBACK_DAYS), analysisMode: settings.analysisMode })
        .then((rows) => alive && setSessions(rows))
        .catch((e) => console.warn(e))
        .finally(() => alive && setLoading(false));
      return () => {
        alive = false;
      };
    }, [repo, settings.analysisMode]),
  );

  const profile = settings.profile;
  return useMemo(() => {
    const insights = findInsights(sessions);
    const habits = habitsFor(sessions);
    const recap = weekRecap(sessions);
    const recentChange = recentVsEarlier(sessions);
    const latest = latestVsUsual(sessions);
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other';
    const tips = recommendTips(
      {
        insights,
        profile,
        recentChange,
        totalSessions: sessions.length,
        medsTimeLogged: sessions.some((s) => s.medsTaken && s.medsTime),
        platform,
      },
      tipLimit,
    );
    return { loading, sessions, insights, habits, recap, recentChange, latest, tips, profile, name: firstName(profile) };
  }, [loading, sessions, profile, tipLimit]);
}
