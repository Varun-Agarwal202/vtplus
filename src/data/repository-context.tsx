import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import type { DataRepository } from '@/data/repository';
import { createSyncRepository } from '@/data/sync-repository';
import { useDatabase } from '@/db/context';
import { getSupabase } from '@/lib/supabase';

export type { DataRepository, SyncInfo } from '@/data/repository';

const RepositoryContext = createContext<DataRepository | null>(null);

export function RepositoryProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const db = useDatabase();
  const repo = useMemo(() => createSyncRepository(db, getSupabase(), userId), [db, userId]);

  useEffect(() => {
    void repo.syncNow().catch((e) => console.warn('sync failed', e));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void repo.syncNow().catch((e) => console.warn('sync failed', e));
    });
    return () => sub.remove();
  }, [repo]);

  return <RepositoryContext.Provider value={repo}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): DataRepository {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useRepository must be used inside RepositoryProvider');
  return ctx;
}
