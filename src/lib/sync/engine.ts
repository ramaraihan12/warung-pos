import {
  markFailed,
  markRetry,
  nextDueAt,
  selectBatch,
  type BackoffOptions,
  type OutboxEntry,
} from './outbox';
import type { SaleEvent, SyncResponse } from './protocol';

export interface OutboxStore {
  all(): Promise<OutboxEntry[]>;
  remove(ids: string[]): Promise<void>;
  put(entries: OutboxEntry[]): Promise<void>;
}

export type FlushOptions = {
  store: OutboxStore;
  /** Throws for anything that should be retried later: no network, 5xx, 401, 429. */
  send: (events: SaleEvent[]) => Promise<SyncResponse>;
  now: () => number;
  batchSize: number;
  backoff?: BackoffOptions;
};

export type FlushResult = {
  batches: number;
  acked: number;
  rejected: number;
  /** When to try again, or null if nothing is left to send. */
  retryAt: number | null;
  error?: string;
};

/**
 * Sends everything that is due, in batches, oldest first. A batch that fails as a whole
 * (network down, server error) is rescheduled with backoff and the loop stops, so a dead
 * network costs one request, not one per batch.
 */
export async function flushOutbox(opts: FlushOptions): Promise<FlushResult> {
  const { store, send, now, batchSize, backoff } = opts;
  const result: FlushResult = { batches: 0, acked: 0, rejected: 0, retryAt: null };

  for (;;) {
    const entries = await store.all();
    const batch = selectBatch(entries, now(), batchSize);
    if (batch.length === 0) {
      result.retryAt = nextDueAt(entries);
      return result;
    }

    let response: SyncResponse;
    try {
      response = await send(batch.map((e) => e.event));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await store.put(batch.map((e) => markRetry(e, now(), message, backoff)));
      result.error = message;
      result.retryAt = nextDueAt(await store.all());
      return result;
    }

    result.batches += 1;
    const acked = new Set(response.acks.map((a) => a.id));
    const rejected = new Map(response.rejected.flatMap((r) => (r.id ? [[r.id, r.reason] as const] : [])));

    const updates: OutboxEntry[] = [];
    for (const entry of batch) {
      if (acked.has(entry.id)) continue;
      const reason = rejected.get(entry.id);
      if (reason !== undefined) updates.push(markFailed(entry, reason));
      else updates.push(markRetry(entry, now(), 'missing from server response', backoff));
    }
    const ackedIds = batch.filter((e) => acked.has(e.id)).map((e) => e.id);
    await store.remove(ackedIds);
    if (updates.length > 0) await store.put(updates);
    result.acked += ackedIds.length;
    result.rejected += updates.filter((u) => u.status === 'failed').length;

    // A batch where nothing was acked would loop on retried entries only if they were still due.
    // markRetry pushes them into the future, so the next pass skips them.
  }
}
