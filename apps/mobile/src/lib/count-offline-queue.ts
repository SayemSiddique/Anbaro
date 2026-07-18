import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  ApiClientError,
  type CreateCountSubmissionRequest,
  type SessionApiClient,
} from '@stock/contracts';

export type QueuedCountSubmission = CreateCountSubmissionRequest & {
  sessionId: string;
  lineId: string;
};

export type CountQueueEntry = {
  id: string;
  operationType: 'count_submission';
  payload: QueuedCountSubmission;
  status: 'pending' | 'syncing' | 'conflict' | 'synced' | 'acknowledged';
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  serverDetails: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
};

export type CountQueueSnapshot = {
  pending: CountQueueEntry[];
  conflicts: CountQueueEntry[];
};

export interface CountQueueStore {
  enqueue(input: QueuedCountSubmission): Promise<void>;
  listByStatus(status: CountQueueEntry['status']): Promise<CountQueueEntry[]>;
  markSyncing(id: string): Promise<void>;
  markSynced(id: string): Promise<void>;
  markPending(id: string, code: string, message: string): Promise<void>;
  markConflict(
    id: string,
    code: string,
    message: string,
    details: Record<string, unknown>,
  ): Promise<void>;
  acknowledgeConflict(id: string): Promise<void>;
}

type QueueRow = {
  id: string;
  operation_type: 'count_submission';
  payload_json: string;
  status: CountQueueEntry['status'];
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  server_details_json: string;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
};

function fromRow(row: QueueRow): CountQueueEntry {
  return {
    id: row.id,
    operationType: row.operation_type,
    payload: JSON.parse(row.payload_json) as QueuedCountSubmission,
    status: row.status,
    attemptCount: row.attempt_count,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    serverDetails: JSON.parse(row.server_details_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

export class SQLiteCountQueueStore implements CountQueueStore {
  private constructor(private readonly database: SQLiteDatabase) {}

  static async open(): Promise<SQLiteCountQueueStore> {
    const database = await openDatabaseAsync('stock-offline.db');
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS offline_count_queue (
        id TEXT PRIMARY KEY NOT NULL,
        operation_type TEXT NOT NULL CHECK (operation_type = 'count_submission'),
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'conflict', 'synced', 'acknowledged')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        last_error_message TEXT,
        server_details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        acknowledged_at TEXT
      );
      CREATE INDEX IF NOT EXISTS offline_count_queue_status_created_idx
        ON offline_count_queue(status, created_at);
      UPDATE offline_count_queue SET status = 'pending'
        WHERE status = 'syncing';
    `);
    return new SQLiteCountQueueStore(database);
  }

  async enqueue(input: QueuedCountSubmission): Promise<void> {
    const now = new Date().toISOString();
    await this.database.runAsync(
      `INSERT INTO offline_count_queue (
         id, operation_type, payload_json, status, created_at, updated_at
       ) VALUES (?, 'count_submission', ?, 'pending', ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      input.idempotencyKey,
      JSON.stringify(input),
      now,
      now,
    );
  }

  async listByStatus(status: CountQueueEntry['status']): Promise<CountQueueEntry[]> {
    const rows = await this.database.getAllAsync<QueueRow>(
      'SELECT * FROM offline_count_queue WHERE status = ? ORDER BY created_at, id',
      status,
    );
    return rows.map(fromRow);
  }

  async markSyncing(id: string): Promise<void> {
    await this.database.runAsync(
      `UPDATE offline_count_queue
       SET status = 'syncing', attempt_count = attempt_count + 1, updated_at = ?
       WHERE id = ?`,
      new Date().toISOString(),
      id,
    );
  }

  async markSynced(id: string): Promise<void> {
    await this.updateStatus(id, 'synced', null, null, {});
  }

  async markPending(id: string, code: string, message: string): Promise<void> {
    await this.updateStatus(id, 'pending', code, message, {});
  }

  async markConflict(
    id: string,
    code: string,
    message: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.updateStatus(id, 'conflict', code, message, details);
  }

  async acknowledgeConflict(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.database.runAsync(
      `UPDATE offline_count_queue
       SET status = 'acknowledged', acknowledged_at = ?, updated_at = ?
       WHERE id = ? AND status = 'conflict'`,
      now,
      now,
      id,
    );
  }

  private async updateStatus(
    id: string,
    status: CountQueueEntry['status'],
    code: string | null,
    message: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.database.runAsync(
      `UPDATE offline_count_queue
       SET status = ?, last_error_code = ?, last_error_message = ?,
         server_details_json = ?, updated_at = ?
       WHERE id = ?`,
      status,
      code,
      message,
      JSON.stringify(details),
      new Date().toISOString(),
      id,
    );
  }
}

/**
 * 401 is retried because the client refreshes the token first; 408 and 429 are
 * the server asking us to come back later. Every other 4xx — a rejected value,
 * a deleted line, a revoked permission — will fail identically on every future
 * attempt, so it has to surface to the counter rather than sit in 'pending'
 * promising a sync that will never happen.
 */
const retryableClientStatuses = new Set([401, 408, 429]);

function isTerminal(error: unknown): error is ApiClientError {
  return (
    error instanceof ApiClientError &&
    error.status >= 400 &&
    error.status < 500 &&
    !retryableClientStatuses.has(error.status)
  );
}

export async function syncPendingCountSubmissions(
  store: CountQueueStore,
  api: Pick<SessionApiClient, 'submitCount'>,
): Promise<CountQueueSnapshot> {
  for (const entry of await store.listByStatus('pending')) {
    await store.markSyncing(entry.id);
    try {
      await api.submitCount(entry.payload.sessionId, entry.payload.lineId, {
        roundNumber: entry.payload.roundNumber,
        quantity: entry.payload.quantity,
        idempotencyKey: entry.payload.idempotencyKey,
        clientCreatedAt: entry.payload.clientCreatedAt,
      });
      await store.markSynced(entry.id);
    } catch (error) {
      if (isTerminal(error)) {
        await store.markConflict(entry.id, error.code, error.message, error.details);
      } else {
        await store.markPending(
          entry.id,
          error instanceof ApiClientError ? error.code : 'NETWORK_UNAVAILABLE',
          error instanceof Error
            ? error.message
            : 'The count will retry when connectivity returns.',
        );
      }
    }
  }
  return getCountQueueSnapshot(store);
}

export async function getCountQueueSnapshot(store: CountQueueStore): Promise<CountQueueSnapshot> {
  const [pending, conflicts] = await Promise.all([
    store.listByStatus('pending'),
    store.listByStatus('conflict'),
  ]);
  return { pending, conflicts };
}
