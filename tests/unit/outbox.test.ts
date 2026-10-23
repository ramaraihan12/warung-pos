import { describe, expect, it } from 'vitest';
import { flushOutbox, type OutboxStore } from '@/lib/sync/engine';
import {
  backoffDelay,
  markRetry,
  newEntry,
  nextDueAt,
  selectBatch,
  type OutboxEntry,
} from '@/lib/sync/outbox';
import type { SaleEvent, SyncResponse } from '@/lib/sync/protocol';

function sale(n: number): SaleEvent {
  const id = `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
  return {
    type: 'sale',
    id,
    cashierId: 'user-1',
    clientCreatedAt: new Date(1_700_000_000_000 + n * 1000).toISOString(),
    method: 'cash',
    total: 4500,
    paid: 5000,
    items: [{ productId: '0190a000-0000-7000-8000-00000000ffff', name: 'Teh', qty: 1, unitPrice: 4500 }],
  };
}

class MemoryStore implements OutboxStore {
  rows = new Map<string, OutboxEntry>();
  all() {
    return Promise.resolve([...this.rows.values()]);
  }
  remove(ids: string[]) {
    ids.forEach((id) => this.rows.delete(id));
    return Promise.resolve();
  }
  put(entries: OutboxEntry[]) {
    entries.forEach((e) => this.rows.set(e.id, e));
    return Promise.resolve();
  }
}

function fill(store: MemoryStore, count: number, at = 1000) {
  for (let i = 1; i <= count; i++) store.rows.set(sale(i).id, newEntry(sale(i), at + i));
}

const ok = (events: SaleEvent[]): SyncResponse => ({
  acks: events.map((e) => ({ id: e.id, status: 'created' })),
  rejected: [],
  serverTime: new Date().toISOString(),
});

describe('backoffDelay', () => {
  const noJitter = { random: () => 1 };

  it('doubles each attempt', () => {
    expect([1, 2, 3, 4].map((a) => backoffDelay(a, noJitter))).toEqual([1000, 2000, 4000, 8000]);
  });

  it('caps at one minute', () => {
    expect(backoffDelay(20, noJitter)).toBe(60_000);
  });

  it('spreads retries between half and the full delay', () => {
    expect(backoffDelay(3, { random: () => 0 })).toBe(2000);
    expect(backoffDelay(3, { random: () => 0.5 })).toBe(3000);
  });
});

describe('selectBatch', () => {
  it('takes the oldest due entries up to the batch size', () => {
    const entries = [3, 1, 2, 4].map((n) => newEntry(sale(n), n));
    const batch = selectBatch(entries, 10, 2);
    expect(batch.map((e) => e.createdAt)).toEqual([1, 2]);
  });

  it('skips entries that are backing off or failed', () => {
    const a = newEntry(sale(1), 1);
    const b = { ...newEntry(sale(2), 2), nextAttemptAt: 500 };
    const c = { ...newEntry(sale(3), 3), status: 'failed' as const };
    expect(selectBatch([a, b, c], 100, 10).map((e) => e.id)).toEqual([a.id]);
  });

  it('reports when the next retry is due', () => {
    const a = { ...newEntry(sale(1), 1), nextAttemptAt: 900 };
    const b = { ...newEntry(sale(2), 2), nextAttemptAt: 700 };
    expect(nextDueAt([a, b])).toBe(700);
    expect(nextDueAt([])).toBeNull();
  });
});

describe('flushOutbox', () => {
  it('sends 250 sales as batches of 100, 100 and 50', async () => {
    const store = new MemoryStore();
    fill(store, 250);
    const sizes: number[] = [];
    const result = await flushOutbox({
      store,
      now: () => 10_000,
      batchSize: 100,
      send: (events) => {
        sizes.push(events.length);
        return Promise.resolve(ok(events));
      },
    });
    expect(sizes).toEqual([100, 100, 50]);
    expect(result).toMatchObject({ batches: 3, acked: 250, rejected: 0, retryAt: null });
    expect(store.rows.size).toBe(0);
  });

  it('keeps everything and backs off when the network is down', async () => {
    const store = new MemoryStore();
    fill(store, 5);
    let calls = 0;
    const result = await flushOutbox({
      store,
      now: () => 10_000,
      batchSize: 2,
      backoff: { random: () => 1 },
      send: () => {
        calls++;
        return Promise.reject(new Error('Failed to fetch'));
      },
    });
    expect(calls).toBe(1);
    expect(store.rows.size).toBe(5);
    expect(result.error).toBe('Failed to fetch');
    // The two entries in the failed batch wait 1s; the other three are untouched and still due.
    const waiting = [...store.rows.values()].filter((e) => e.attempts === 1);
    expect(waiting).toHaveLength(2);
    expect(waiting.every((e) => e.nextAttemptAt === 11_000)).toBe(true);
  });

  it('grows the delay on repeated failures', async () => {
    const store = new MemoryStore();
    fill(store, 1);
    let t = 10_000;
    const run = () =>
      flushOutbox({
        store,
        now: () => t,
        batchSize: 10,
        backoff: { random: () => 1 },
        send: () => Promise.reject(new Error('503')),
      });
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await run();
      delays.push((r.retryAt ?? 0) - t);
      t = r.retryAt ?? t;
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
  });

  it('does not retry before the backoff has passed', async () => {
    const store = new MemoryStore();
    store.rows.set(sale(1).id, markRetry(newEntry(sale(1), 1), 10_000, 'x', { random: () => 1 }));
    let calls = 0;
    const result = await flushOutbox({
      store,
      now: () => 10_500,
      batchSize: 10,
      send: (e) => {
        calls++;
        return Promise.resolve(ok(e));
      },
    });
    expect(calls).toBe(0);
    expect(result.retryAt).toBe(11_000);
  });

  it('treats a duplicate ack as done', async () => {
    const store = new MemoryStore();
    fill(store, 2);
    await flushOutbox({
      store,
      now: () => 10_000,
      batchSize: 10,
      send: (events) =>
        Promise.resolve({
          acks: events.map((e) => ({ id: e.id, status: 'duplicate' as const })),
          rejected: [],
          serverTime: '',
        }),
    });
    expect(store.rows.size).toBe(0);
  });

  it('parks a rejected sale as failed and keeps sending the rest', async () => {
    const store = new MemoryStore();
    fill(store, 3);
    const bad = sale(2).id;
    const result = await flushOutbox({
      store,
      now: () => 10_000,
      batchSize: 10,
      send: (events) =>
        Promise.resolve({
          acks: events.filter((e) => e.id !== bad).map((e) => ({ id: e.id, status: 'created' as const })),
          rejected: [{ id: bad, reason: 'unknown product' }],
          serverTime: '',
        }),
    });
    expect(result).toMatchObject({ acked: 2, rejected: 1, retryAt: null });
    expect([...store.rows.values()]).toMatchObject([
      { id: bad, status: 'failed', lastError: 'unknown product' },
    ]);
  });

  it('retries an entry the server neither acked nor rejected', async () => {
    const store = new MemoryStore();
    fill(store, 2);
    const result = await flushOutbox({
      store,
      now: () => 10_000,
      batchSize: 10,
      send: (events) => Promise.resolve({ ...ok(events.slice(0, 1)), serverTime: '' }),
    });
    expect(result.acked).toBe(1);
    expect(store.rows.size).toBe(1);
    expect([...store.rows.values()][0]?.attempts).toBe(1);
  });
});
