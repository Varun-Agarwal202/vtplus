import type { SessionFilter } from '@/db/sessions';
import type { Settings } from '@/db/settings';
import type { NewSession, Session, SessionTags } from '@/db/types';

export interface SyncInfo {
  pendingCount: number;
  lastLocalWrite: string | null;
}

export interface DataRepository {
  loadSettings: () => Promise<Settings>;
  saveSetting: <K extends keyof Settings>(key: K, value: Settings[K], current: Settings) => Promise<void>;
  clearSettings: () => Promise<void>;
  insertSession: (s: NewSession) => Promise<Session>;
  updateSessionTags: (id: string, tags: SessionTags) => Promise<void>;
  setSessionRawPath: (id: string, rawPath: string | null) => Promise<void>;
  listSessions: (filter?: SessionFilter) => Promise<Session[]>;
  getSession: (id: string) => Promise<Session | null>;
  deleteSession: (id: string) => Promise<void>;
  deleteAllSessions: () => Promise<void>;
  syncNow: () => Promise<void>;
  getSyncInfo: () => Promise<SyncInfo>;
}
