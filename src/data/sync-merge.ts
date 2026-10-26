import type { SyncStatus } from '@/db/sessions';

export type { SyncStatus };

export interface LocalSyncRow {
  id: string;
  syncStatus: SyncStatus;
}

export interface PullPlan {
  /** Remote rows that should overwrite the local cache. */
  applyRemoteIds: string[];
  /** Synced local rows that were deleted in the cloud. */
  deleteLocalIds: string[];
}

/**
 * Local pending writes always win until they flush. Synced rows follow the cloud.
 */
export function planPull(local: LocalSyncRow[], remoteIds: string[]): PullPlan {
  const remote = new Set(remoteIds);
  const applyRemoteIds: string[] = [];
  const deleteLocalIds: string[] = [];

  const localById = new Map(local.map((r) => [r.id, r]));

  for (const id of remoteIds) {
    const row = localById.get(id);
    if (!row) {
      applyRemoteIds.push(id);
      continue;
    }
    if (row.syncStatus === 'synced') applyRemoteIds.push(id);
  }

  for (const row of local) {
    if (row.syncStatus !== 'synced') continue;
    if (!remote.has(row.id)) deleteLocalIds.push(row.id);
  }

  return { applyRemoteIds, deleteLocalIds };
}

export function isPending(status: SyncStatus): boolean {
  return status !== 'synced';
}
