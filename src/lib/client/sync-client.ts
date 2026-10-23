import { v7 as uuidv7 } from 'uuid';
import { flushOutbox, type OutboxStore } from '@/lib/sync/engine';
import { planCatalogMerge } from '@/lib/sync/catalog';
import { newEntry, type OutboxEntry } from '@/lib/sync/outbox';
import { CatalogResponseSchema, MAX_BATCH, type SaleEvent, type SyncResponse } from '@/lib/sync/protocol';
import { getMeta, localDb, setMeta } from './db';

export const dexieOutbox: OutboxStore = {
  all: () => localDb().outbox.toArray(),
  remove: async (ids) => {
    await localDb().outbox.bulkDelete(ids);
  },
  put: async (entries) => {
    await localDb().outbox.bulkPut(entries);
  },
};

/** The device id is made once per browser profile and kept in two places in case one is cleared. */
export async function getDeviceId(): Promise<string> {
  let id: string | undefined;
  try {
    id = localStorage.getItem('warung.deviceId') ?? undefined;
  } catch {
    // storage blocked: fall through to IndexedDB
  }
  id ??= await getMeta<string>('deviceId');
  if (!id) id = uuidv7();
  try {
    localStorage.setItem('warung.deviceId', id);
  } catch {
    // ignore
  }
  await setMeta('deviceId', id);
  return id;
}

export function defaultDeviceName(userName: string, deviceId: string): string {
  return `${userName} (${deviceId.slice(-4)})`;
}

/** Writes the sale to the outbox. This is the only thing a sale needs to survive: a local write. */
export async function enqueueSale(event: SaleEvent): Promise<void> {
  await localDb().outbox.put(newEntry(event, Date.now()));
}

export class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function postSync(deviceId: string, events: SaleEvent[]): Promise<SyncResponse> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, sentAt: new Date().toISOString(), events }),
  });
  if (!res.ok) throw new SyncHttpError(`server answered ${res.status}`, res.status);
  return (await res.json()) as SyncResponse;
}

export async function flushNow() {
  const deviceId = await getDeviceId();
  return flushOutbox({
    store: dexieOutbox,
    batchSize: MAX_BATCH,
    now: Date.now,
    send: (events) => postSync(deviceId, events),
  });
}

/** Pulls catalog deltas after the stored cursor until the server says there is no more. */
export async function pullCatalog(): Promise<number> {
  let cursor = (await getMeta<number>('catalogCursor')) ?? 0;
  let changed = 0;
  for (;;) {
    const res = await fetch(`/api/catalog?since=${cursor}&limit=500`);
    if (!res.ok) throw new SyncHttpError(`catalog answered ${res.status}`, res.status);
    const page = CatalogResponseSchema.parse(await res.json());
    const local = new Map((await localDb().products.toArray()).map((p) => [p.id, p.version]));
    const plan = planCatalogMerge(local, page.products, cursor);
    await localDb().transaction('rw', localDb().products, localDb().meta, async () => {
      if (plan.upsert.length > 0) await localDb().products.bulkPut(plan.upsert);
      if (plan.remove.length > 0) await localDb().products.bulkDelete(plan.remove);
      await setMeta('catalogCursor', plan.cursor);
    });
    changed += plan.upsert.length + plan.remove.length;
    cursor = plan.cursor;
    if (!page.hasMore) return changed;
  }
}

export async function outboxCounts(): Promise<{ pending: number; failed: number }> {
  const all: OutboxEntry[] = await localDb().outbox.toArray();
  return {
    pending: all.filter((e) => e.status === 'pending').length,
    failed: all.filter((e) => e.status === 'failed').length,
  };
}

export async function sendHeartbeat(name: string): Promise<void> {
  const [id, counts] = await Promise.all([getDeviceId(), outboxCounts()]);
  const res = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, pending: counts.pending, failed: counts.failed }),
  });
  if (!res.ok) throw new SyncHttpError(`heartbeat answered ${res.status}`, res.status);
}
