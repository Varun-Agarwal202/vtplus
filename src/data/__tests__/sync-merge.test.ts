import { planPull } from '../sync-merge';

describe('planPull', () => {
  test('applies new remote rows and leaves pending local rows alone', () => {
    const plan = planPull(
      [
        { id: 'a', syncStatus: 'synced' },
        { id: 'b', syncStatus: 'pending_insert' },
        { id: 'c', syncStatus: 'pending_update' },
        { id: 'd', syncStatus: 'pending_delete' },
      ],
      ['a', 'c', 'e'],
    );
    expect(plan.applyRemoteIds).toEqual(['a', 'e']);
    expect(plan.deleteLocalIds).toEqual([]);
  });

  test('drops synced local rows that disappeared from the cloud', () => {
    const plan = planPull(
      [
        { id: 'keep', syncStatus: 'synced' },
        { id: 'gone', syncStatus: 'synced' },
        { id: 'draft', syncStatus: 'pending_insert' },
      ],
      ['keep'],
    );
    expect(plan.applyRemoteIds).toEqual(['keep']);
    expect(plan.deleteLocalIds).toEqual(['gone']);
  });

  test('empty local cache takes the full remote set', () => {
    const plan = planPull([], ['x', 'y']);
    expect(plan.applyRemoteIds).toEqual(['x', 'y']);
    expect(plan.deleteLocalIds).toEqual([]);
  });
});
