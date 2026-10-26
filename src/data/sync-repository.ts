import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { DataRepository, SyncInfo } from '@/data/repository';
import { planPull } from '@/data/sync-merge';
import * as cloudSessions from '@/data/supabase-sessions';
import * as cloudSettings from '@/data/supabase-settings';
import {
  clearCachedUserSettings,
  DEFAULT_SETTINGS,
  loadCachedUserSettings,
  saveCachedUserSettings,
} from '@/db/settings';
import {
  countPending,
  deleteAllSessions as deleteAllLocal,
  deleteSession as deleteLocal,
  getCachedSession,
  getSession as getLocalSession,
  insertSession as insertLocal,
  listCachedSessions,
  listPendingSessions,
  listSessions as listLocal,
  markPendingDelete,
  markSynced,
  setSessionRawPath as setLocalRawPath,
  type SessionFilter,
  updateSessionTags as updateLocalTags,
  upsertSession as upsertLocal,
} from '@/db/sessions';
import type { NewSession, SessionTags } from '@/db/types';

export function createSyncRepository(db: SQLiteDatabase, client: SupabaseClient, userId: string): DataRepository {
  let chain: Promise<void> = Promise.resolve();

  const enqueue = (job: () => Promise<void>) => {
    const run = chain.then(job);
    chain = run.catch(() => undefined);
    return run;
  };

  const push = async () => {
    const pending = await listPendingSessions(db, userId);
    for (const row of pending) {
      if (row.syncStatus === 'pending_delete') {
        await cloudSessions.deleteSession(client, userId, row.session.id);
        await deleteLocal(db, userId, row.session.id);
        continue;
      }
      await cloudSessions.upsertSession(client, userId, row.session);
      await markSynced(db, userId, row.session.id);
    }

    const cached = await loadCachedUserSettings(db, userId);
    if (cached?.dirty) {
      await cloudSettings.saveSettings(client, userId, cached.settings);
      await saveCachedUserSettings(db, userId, cached.settings, false);
    }
  };

  const pull = async () => {
    const [remote, local] = await Promise.all([cloudSessions.listAllSessions(client, userId), listCachedSessions(db, userId)]);
    const plan = planPull(
      local.map((r) => ({ id: r.session.id, syncStatus: r.syncStatus })),
      remote.map((s) => s.id),
    );
    const remoteById = new Map(remote.map((s) => [s.id, s]));
    for (const id of plan.applyRemoteIds) {
      const session = remoteById.get(id);
      if (session) await upsertLocal(db, userId, session, 'synced');
    }
    for (const id of plan.deleteLocalIds) {
      await deleteLocal(db, userId, id);
    }

    const cached = await loadCachedUserSettings(db, userId);
    if (!cached?.dirty) {
      const remoteSettings = await cloudSettings.loadSettings(client, userId);
      await saveCachedUserSettings(db, userId, remoteSettings, false);
    }
  };

  const flush = async (): Promise<void> => {
    await push();
    await pull();
  };

  const syncNow = () =>
    enqueue(
      () =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Sync timed out. Your data is saved on this phone.')), 12_000);
          flush().then(
            () => {
              clearTimeout(timer);
              resolve();
            },
            (e) => {
              clearTimeout(timer);
              reject(e);
            },
          );
        }),
    );

  const trySync = () => {
    void syncNow().catch((e) => console.warn('sync failed', e));
  };

  return {
    loadSettings: async () => {
      const cached = await loadCachedUserSettings(db, userId);
      if (cached) {
        trySync();
        return cached.settings;
      }
      try {
        await syncNow();
      } catch (e) {
        console.warn('settings sync failed', e);
        return { ...DEFAULT_SETTINGS };
      }
      const after = await loadCachedUserSettings(db, userId);
      return after?.settings ?? { ...DEFAULT_SETTINGS };
    },

    saveSetting: async (key, value, current) => {
      const next = { ...current, [key]: value };
      await saveCachedUserSettings(db, userId, next, true);
      trySync();
    },

    clearSettings: async () => {
      await clearCachedUserSettings(db, userId);
      await saveCachedUserSettings(db, userId, { ...DEFAULT_SETTINGS }, true);
      try {
        await cloudSettings.clearSettings(client, userId);
        await saveCachedUserSettings(db, userId, { ...DEFAULT_SETTINGS }, false);
      } catch (e) {
        console.warn('clear settings sync failed', e);
      }
    },

    insertSession: async (s: NewSession) => {
      const session = await insertLocal(db, userId, s);
      trySync();
      return session;
    },

    updateSessionTags: async (id: string, tags: SessionTags) => {
      await updateLocalTags(db, userId, id, tags);
      trySync();
    },

    setSessionRawPath: async (id: string, rawPath: string | null) => {
      await setLocalRawPath(db, userId, id, rawPath);
      trySync();
    },

    listSessions: (filter?: SessionFilter) => listLocal(db, userId, filter),

    getSession: (id: string) => getLocalSession(db, userId, id),

    deleteSession: async (id: string) => {
      const row = await getCachedSession(db, userId, id, true);
      if (!row) return;
      if (row.syncStatus === 'pending_insert') {
        await deleteLocal(db, userId, id);
        return;
      }
      await markPendingDelete(db, userId, id);
      trySync();
    },

    deleteAllSessions: async () => {
      const rows = await listCachedSessions(db, userId);
      const onlyLocal = rows.every((r) => r.syncStatus === 'pending_insert');
      if (onlyLocal) {
        await deleteAllLocal(db, userId);
        return;
      }
      for (const row of rows) {
        if (row.syncStatus === 'pending_insert') await deleteLocal(db, userId, row.session.id);
        else await markPendingDelete(db, userId, row.session.id);
      }
      try {
        await cloudSessions.deleteAllSessions(client, userId);
        await deleteAllLocal(db, userId);
      } catch (e) {
        console.warn('delete-all sync failed', e);
      }
    },

    syncNow,

    getSyncInfo: async (): Promise<SyncInfo> => {
      const cached = await loadCachedUserSettings(db, userId);
      const pendingSessions = await countPending(db, userId);
      return {
        pendingCount: pendingSessions + (cached?.dirty ? 1 : 0),
        lastLocalWrite: cached?.updatedAt ?? null,
      };
    },
  };
}

export type { SessionTags };
