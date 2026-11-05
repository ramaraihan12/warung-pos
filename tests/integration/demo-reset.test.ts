import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '@/db';
import { planCatalogMerge } from '@/lib/sync/catalog';
import { catalogDelta, updateProduct } from '@/server/products';
import { resetData, seedProducts, seedUsers } from '@/server/seed';
import { SEED_PRODUCTS, SEED_USERS } from '@/server/seed-data';
import { processSyncBatch } from '@/server/sync';

const url = process.env.TEST_DATABASE_URL;

// The public demo runs `db:seed --reset` every day, while browsers keep the catalog they cached.
describe.skipIf(!url)('resetting the shop under a till that cached the catalog', () => {
  const { db, client } = createDb(url ?? 'postgresql://unused', 4);

  async function resetShop() {
    await resetData(db);
    await seedUsers(db);
    await seedProducts(db);
  }

  /** What a till holds after its first pull. */
  async function tillAfterFirstPull() {
    const first = await catalogDelta(db, 0);
    return {
      cursor: first.cursor,
      local: new Map(first.products.map((p) => [p.id, p])),
    };
  }

  async function pull(till: Awaited<ReturnType<typeof tillAfterFirstPull>>) {
    const delta = await catalogDelta(db, till.cursor);
    const versions = new Map([...till.local].map(([id, p]) => [id, p.version]));
    const plan = planCatalogMerge(versions, delta.products, till.cursor);
    for (const p of plan.upsert) till.local.set(p.id, { ...p, active: true });
    for (const id of plan.remove) till.local.delete(id);
    till.cursor = plan.cursor;
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: './drizzle' });
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(resetShop);

  it('leaves one copy of each product on the till', async () => {
    const till = await tillAfterFirstPull();
    await resetShop();
    await pull(till);
    expect(till.local.size).toBe(SEED_PRODUCTS.length);
  });

  it('puts back a price a visitor changed', async () => {
    const seeded = SEED_PRODUCTS[0]!;
    const till = await tillAfterFirstPull();
    const product = [...till.local.values()].find((p) => p.sku === seeded.sku)!;
    await updateProduct(db, product.id, { ...seeded, price: 1 });
    await pull(till);
    expect(till.local.get(product.id)?.price).toBe(1);

    await resetShop();
    await pull(till);
    expect(till.local.get(product.id)?.price).toBe(seeded.price);
  });

  it('still accepts a sale of a product cached before the reset', async () => {
    const till = await tillAfterFirstPull();
    await resetShop();

    const cached = [...till.local.values()][0]!;
    const cashier = SEED_USERS[1].id;
    const id = uuidv7();
    const result = await processSyncBatch(db, {
      userId: cashier,
      body: {
        deviceId: uuidv7(),
        sentAt: new Date().toISOString(),
        events: [
          {
            type: 'sale',
            id,
            cashierId: cashier,
            clientCreatedAt: new Date().toISOString(),
            method: 'qris',
            total: cached.price,
            paid: cached.price,
            items: [{ productId: cached.id, name: cached.name, qty: 1, unitPrice: cached.price }],
          },
        ],
      },
    });
    expect(result.rejected).toEqual([]);
    expect(result.acks).toEqual([{ id, status: 'created' }]);
  });
});
