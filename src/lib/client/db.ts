import Dexie, { type EntityTable } from 'dexie';
import type { OutboxEntry } from '@/lib/sync/outbox';
import type { LocalProduct } from '@/lib/sync/catalog';

export type MetaRow = { key: string; value: string | number };

/** Everything the POS needs while offline lives in this one IndexedDB database. */
class WarungDb extends Dexie {
  products!: EntityTable<LocalProduct, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('warung-pos');
    this.version(1).stores({
      products: 'id, sku, name',
      outbox: 'id, status, createdAt',
      meta: 'key',
    });
  }
}

let instance: WarungDb | null = null;

/** Created on first use, so importing this file on the server does not touch IndexedDB. */
export function localDb(): WarungDb {
  instance ??= new WarungDb();
  return instance;
}

export async function getMeta<T extends string | number>(key: string): Promise<T | undefined> {
  return (await localDb().meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: string | number): Promise<void> {
  await localDb().meta.put({ key, value });
}
