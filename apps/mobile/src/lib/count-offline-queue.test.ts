import { ApiClientError } from '@stock/contracts';

import {
  syncPendingCountSubmissions,
  type CountQueueEntry,
  type CountQueueStore,
  type QueuedCountSubmission,
} from './count-offline-queue';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

class MemoryQueue implements CountQueueStore {
  readonly entries = new Map<string, CountQueueEntry>();

  async enqueue(input: QueuedCountSubmission) {
    if (!this.entries.has(input.idempotencyKey)) {
      this.entries.set(input.idempotencyKey, {
        id: input.idempotencyKey,
        operationType: 'count_submission',
        payload: input,
        status: 'pending',
        attemptCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        serverDetails: {},
        createdAt: input.clientCreatedAt,
        updatedAt: input.clientCreatedAt,
        acknowledgedAt: null,
      });
    }
  }

  async listByStatus(status: CountQueueEntry['status']) {
    return [...this.entries.values()].filter((entry) => entry.status === status);
  }

  async markSyncing(id: string) {
    this.update(id, { status: 'syncing', attemptCount: this.entries.get(id)!.attemptCount + 1 });
  }

  async markSynced(id: string) {
    this.update(id, { status: 'synced', lastErrorCode: null, lastErrorMessage: null });
  }

  async markPending(id: string, code: string, message: string) {
    this.update(id, { status: 'pending', lastErrorCode: code, lastErrorMessage: message });
  }

  async markConflict(id: string, code: string, message: string, details: Record<string, unknown>) {
    this.update(id, {
      status: 'conflict',
      lastErrorCode: code,
      lastErrorMessage: message,
      serverDetails: details,
    });
  }

  async acknowledgeConflict(id: string) {
    this.update(id, { status: 'acknowledged', acknowledgedAt: new Date().toISOString() });
  }

  private update(id: string, patch: Partial<CountQueueEntry>) {
    this.entries.set(id, { ...this.entries.get(id)!, ...patch });
  }
}

const queuedSubmission: QueuedCountSubmission = {
  sessionId: '10000000-0000-4000-8000-000000000001',
  lineId: '20000000-0000-4000-8000-000000000001',
  roundNumber: 1,
  quantity: 4,
  idempotencyKey: '30000000-0000-4000-8000-000000000001',
  clientCreatedAt: '2026-07-14T20:00:00.000Z',
};

describe('offline count sync', () => {
  it('replays a pending submission through the count API and marks it synced', async () => {
    const store = new MemoryQueue();
    await store.enqueue(queuedSubmission);
    const submitCount = jest.fn().mockResolvedValue({ data: {} });

    const snapshot = await syncPendingCountSubmissions(store, { submitCount });

    expect(submitCount).toHaveBeenCalledWith(
      queuedSubmission.sessionId,
      queuedSubmission.lineId,
      expect.objectContaining({ idempotencyKey: queuedSubmission.idempotencyKey }),
    );
    expect(snapshot).toEqual({ pending: [], conflicts: [] });
    expect(store.entries.get(queuedSubmission.idempotencyKey)?.status).toBe('synced');
  });

  it('retains local values and visibly classifies a server state conflict', async () => {
    const store = new MemoryQueue();
    await store.enqueue(queuedSubmission);
    const submitCount = jest
      .fn()
      .mockRejectedValue(
        new ApiClientError(
          409,
          'COUNT_SESSION_CLOSED',
          'The session was finalized while offline.',
          { status: 'finalized' },
        ),
      );

    const snapshot = await syncPendingCountSubmissions(store, { submitCount });

    expect(snapshot.conflicts[0]).toMatchObject({
      payload: { quantity: 4 },
      lastErrorCode: 'COUNT_SESSION_CLOSED',
      serverDetails: { status: 'finalized' },
    });
    expect(snapshot.pending).toEqual([]);
  });

  it('surfaces a rejected value instead of retrying it forever', async () => {
    const store = new MemoryQueue();
    await store.enqueue(queuedSubmission);
    const submitCount = jest
      .fn()
      .mockRejectedValue(
        new ApiClientError(400, 'VALIDATION_FAILED', 'The request is invalid.', {}),
      );

    const first = await syncPendingCountSubmissions(store, { submitCount });
    expect(first.pending).toEqual([]);
    expect(first.conflicts[0]).toMatchObject({ lastErrorCode: 'VALIDATION_FAILED' });

    // A later sync must not pick the entry back up and call the API again.
    const second = await syncPendingCountSubmissions(store, { submitCount });
    expect(submitCount).toHaveBeenCalledTimes(1);
    expect(second.pending).toEqual([]);
  });

  it('keeps retrying when the failure is transient', async () => {
    const store = new MemoryQueue();
    await store.enqueue(queuedSubmission);
    const submitCount = jest.fn().mockRejectedValue(new Error('Network request failed'));

    const snapshot = await syncPendingCountSubmissions(store, { submitCount });

    expect(snapshot.conflicts).toEqual([]);
    expect(snapshot.pending[0]).toMatchObject({ lastErrorCode: 'NETWORK_UNAVAILABLE' });
  });

  it('retries an expired token rather than discarding the count', async () => {
    const store = new MemoryQueue();
    await store.enqueue(queuedSubmission);
    const submitCount = jest
      .fn()
      .mockRejectedValue(new ApiClientError(401, 'AUTH_SESSION_INVALID', 'Expired.', {}));

    const snapshot = await syncPendingCountSubmissions(store, { submitCount });

    expect(snapshot.conflicts).toEqual([]);
    expect(snapshot.pending[0]).toMatchObject({ lastErrorCode: 'AUTH_SESSION_INVALID' });
  });
});
