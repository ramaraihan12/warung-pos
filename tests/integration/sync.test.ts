import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '@/db';
import { products, saleItems, sales, stockMovements } from '@/db/schema';
import type { SaleEvent } from '@/lib/sync/protocol';
import { catalogDelta, createProduct, setProductActive, updateProduct } from '@/server/products';
import { byMethod, dailyTotals, parseRange, skewedSales, summary } from '@/server/reports';
import { resetData, seedProducts, seedUsers } from '@/server/seed';
import { attentionList, receiveStock, stockOf } from '@/server/stock';
import { SEED_PRODUCTS } from '@/server/seed-data';
import { BadRequestError, processSyncBatch, recordHeartbeat } from '@/server/sync';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('sync and stock against postgres', () => {
  const { db, client } = createDb(url ?? 'postgresql://unused', 4);
  const NOW = new Date('2026-03-10T05:00:00.000Z');

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: './drizzle' });
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(async () => {
    await resetData(db);
    await seedUsers(db);
    await seedProducts(db);
  });

  async function product(sku: string) {
    const [p] = await db.select().from(products).where(eq(products.sku, sku));
    if (!p) throw new Error(`no product ${sku}`);
    return p;
  }

  function saleOf(
    p: { id: string; name: string; price: number },
    qty = 1,
    extra: Partial<SaleEvent> = {},
  ): SaleEvent {
    const total = p.price * qty;
    return {
      type: 'sale',
      id: uuidv7(),
      cashierId: 'user-kasir1',
      clientCreatedAt: NOW.toISOString(),
      method: 'cash',
      total,
      paid: total + 1000,
      items: [{ productId: p.id, name: p.name, qty, unitPrice: p.price }],
      ...extra,
    };
  }

  const send = (
    events: unknown[],
    opts: { device?: string; user?: string; sentAt?: Date; now?: Date } = {},
  ) =>
    processSyncBatch(db, {
      userId: opts.user ?? 'user-kasir1',
      now: opts.now ?? NOW,
      body: { deviceId: opts.device ?? DEVICE_A, sentAt: (opts.sentAt ?? NOW).toISOString(), events },
    });

  const DEVICE_A = uuidv7();
  const DEVICE_B = uuidv7();

  it('stores a sale, its items and a negative stock movement', async () => {
    const teh = await product('8990003003');
    const before = await stockOf(db, teh.id);
    const event = saleOf(teh, 3);
    const res = await send([event]);

    expect(res.acks).toEqual([{ id: event.id, status: 'created' }]);
    expect(res.rejected).toEqual([]);
    const [row] = await db.select().from(sales).where(eq(sales.id, event.id));
    expect(row).toMatchObject({
      total: 13_500,
      paid: 14_500,
      changeGiven: 1000,
      method: 'cash',
      deviceId: DEVICE_A,
    });
    expect(await db.select().from(saleItems).where(eq(saleItems.saleId, event.id))).toHaveLength(1);
    expect(await stockOf(db, teh.id)).toBe(before - 3);
  });

  it('is idempotent: sending the same batch twice changes nothing the second time', async () => {
    const teh = await product('8990003003');
    const event = saleOf(teh, 2);
    const first = await send([event]);
    const after = await stockOf(db, teh.id);
    const second = await send([event]);

    expect(first.acks[0]?.status).toBe('created');
    expect(second.acks).toEqual([{ id: event.id, status: 'duplicate' }]);
    expect(await stockOf(db, teh.id)).toBe(after);
    expect(await db.select().from(sales)).toHaveLength(1);
  });

  it('applies the new sales in a batch that also holds old ones', async () => {
    const teh = await product('8990003003');
    const old = saleOf(teh);
    await send([old]);
    const fresh = saleOf(teh);
    const res = await send([old, fresh]);
    expect(Object.fromEntries(res.acks.map((a) => [a.id, a.status]))).toEqual({
      [old.id]: 'duplicate',
      [fresh.id]: 'created',
    });
    expect(await db.select().from(sales)).toHaveLength(2);
  });

  it('survives two requests racing with the same sale id', async () => {
    const teh = await product('8990003003');
    const event = saleOf(teh);
    const results = await Promise.all([
      send([event]),
      send([event], { device: DEVICE_B, user: 'user-kasir2' }),
    ]);
    const statuses = results.map((r) => r.acks[0]?.status).sort();
    expect(statuses).toEqual(['created', 'duplicate']);
    expect(await db.select().from(sales)).toHaveLength(1);
    expect(await db.select().from(stockMovements).where(eq(stockMovements.saleId, event.id))).toHaveLength(1);
  });

  it('keeps both sales when two devices sell the last unit, and flags the product', async () => {
    const telur = await product('8990001007');
    // Bring stock to exactly one.
    const level = await stockOf(db, telur.id);
    await db
      .insert(stockMovements)
      .values({ productId: telur.id, delta: 1 - level, kind: 'adjust', note: 'hitung ulang' });
    expect(await stockOf(db, telur.id)).toBe(1);

    await recordHeartbeat(db, 'user-kasir1', { id: DEVICE_A, name: 'Kasir depan', pending: 0, failed: 0 });
    await recordHeartbeat(db, 'user-kasir2', { id: DEVICE_B, name: 'Tablet samping', pending: 0, failed: 0 });
    const a = saleOf(telur, 1);
    const b = saleOf(telur, 1, { cashierId: 'user-kasir2' });
    const [ra, rb] = await Promise.all([
      send([a], { device: DEVICE_A }),
      send([b], { device: DEVICE_B, user: 'user-kasir2' }),
    ]);

    expect(ra.acks[0]?.status).toBe('created');
    expect(rb.acks[0]?.status).toBe('created');
    expect(await db.select().from(sales)).toHaveLength(2);
    expect(await stockOf(db, telur.id)).toBe(-1);

    const attention = await attentionList(db);
    expect(attention).toHaveLength(1);
    expect(attention[0]).toMatchObject({ sku: '8990001007', stock: -1 });
    expect(attention[0]?.devices).toHaveLength(2);
  });

  it('clears the attention entry once the owner receives stock', async () => {
    const telur = await product('8990001007');
    const level = await stockOf(db, telur.id);
    await send([saleOf(telur, level + 2)]);
    expect(await stockOf(db, telur.id)).toBe(-2);
    await receiveStock(db, { productId: telur.id, qty: 10 }, 'user-owner');
    expect(await stockOf(db, telur.id)).toBe(8);
    expect(await attentionList(db)).toEqual([]);
  });

  it('merges lines for the same product into one movement', async () => {
    const teh = await product('8990003003');
    const event = saleOf(teh, 1);
    event.items = [
      { productId: teh.id, name: teh.name, qty: 2, unitPrice: teh.price },
      { productId: teh.id, name: teh.name, qty: 3, unitPrice: teh.price },
    ];
    event.total = teh.price * 5;
    event.paid = event.total;
    await send([event]);
    const moves = await db.select().from(stockMovements).where(eq(stockMovements.saleId, event.id));
    expect(moves).toHaveLength(1);
    expect(moves[0]?.delta).toBe(-5);
    expect(await db.select().from(saleItems).where(eq(saleItems.saleId, event.id))).toHaveLength(2);
  });

  it('rejects bad sales one by one and still applies the good ones', async () => {
    const teh = await product('8990003003');
    const good = saleOf(teh);
    const wrongTotal = saleOf(teh, 1, { total: 1 });
    const underpaid = saleOf(teh, 1, { paid: 100 });
    const ghost = saleOf({ id: uuidv7(), name: 'Tidak ada', price: 1000 });
    const stranger = saleOf(teh, 1, { cashierId: 'nobody' });
    const res = await send([good, wrongTotal, underpaid, ghost, stranger, { id: 'not-a-sale' }]);

    expect(res.acks).toEqual([{ id: good.id, status: 'created' }]);
    const reasons = Object.fromEntries(res.rejected.map((r) => [r.id, r.reason]));
    expect(reasons[wrongTotal.id]).toBe('total does not match items');
    expect(reasons[underpaid.id]).toBe('paid is less than total');
    expect(reasons[ghost.id]).toBe('unknown product');
    expect(reasons[stranger.id]).toBe('unknown cashier');
    expect(res.rejected.find((r) => r.id === 'not-a-sale')?.reason).toMatch(/^invalid event/);
    expect(await db.select().from(sales)).toHaveLength(1);
  });

  it('refuses a malformed request and an oversized batch', async () => {
    await expect(send([])).rejects.toBeInstanceOf(BadRequestError);
    const teh = await product('8990003003');
    await expect(send(Array.from({ length: 101 }, () => saleOf(teh)))).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('measures clock skew at send time and flags only large ones', async () => {
    const teh = await product('8990003003');
    // Sold two hours before it was sent, device clock correct: not flagged.
    const offline = saleOf(teh, 1, { clientCreatedAt: new Date(NOW.getTime() - 2 * 3600_000).toISOString() });
    await send([offline], { sentAt: NOW });
    // Device clock is 20 minutes fast when it sends: flagged.
    const fast = saleOf(teh);
    await send([fast], { device: DEVICE_B, sentAt: new Date(NOW.getTime() + 20 * 60_000) });

    const range = parseRange('2026-03-10', '2026-03-10', NOW);
    const flagged = await skewedSales(db, range);
    expect(flagged.map((r) => r.id)).toEqual([fast.id]);
    expect(flagged[0]?.clock_skew_ms).toBe(20 * 60_000);
  });

  it('serves catalog deltas by version cursor', async () => {
    const first = await catalogDelta(db, 0, 1000);
    expect(first.products.length).toBe(SEED_PRODUCTS.length);
    expect(first.hasMore).toBe(false);
    const cursor = first.cursor;

    expect((await catalogDelta(db, cursor)).products).toEqual([]);

    const teh = await product('8990003003');
    await updateProduct(db, teh.id, {
      name: teh.name,
      sku: teh.sku,
      price: 5000,
      unit: teh.unit,
      category: teh.category,
    });
    await createProduct(db, { name: 'Permen', sku: 'new-1', price: 500, unit: 'butir', category: 'Makanan' });
    await setProductActive(db, (await product('8990006006')).id, false);

    const delta = await catalogDelta(db, cursor);
    expect(delta.products).toHaveLength(3);
    expect(delta.products.find((p) => p.sku === '8990003003')?.price).toBe(5000);
    expect(delta.products.find((p) => p.sku === '8990006006')?.active).toBe(false);
    expect(delta.cursor).toBeGreaterThan(cursor);
  });

  it('pages a catalog pull', async () => {
    const page = await catalogDelta(db, 0, 15);
    expect(page.products).toHaveLength(15);
    expect(page.hasMore).toBe(true);
    const next = await catalogDelta(db, page.cursor, 15);
    expect(next.products[0]?.version).toBeGreaterThan(page.cursor);
  });

  it('reports totals by day and by method in shop time', async () => {
    const teh = await product('8990003003');
    // 23:30 UTC on the 9th is 06:30 on the 10th in Salatiga.
    const early = saleOf(teh, 2, { clientCreatedAt: '2026-03-09T23:30:00.000Z' });
    const qris = saleOf(teh, 1, { method: 'qris', paid: teh.price, total: teh.price });
    await send([early, qris]);

    const range = parseRange('2026-03-10', '2026-03-10', NOW);
    expect(await summary(db, range)).toMatchObject({ sales: 2, revenue: 13_500, items: 3 });
    expect(await dailyTotals(db, range)).toEqual([{ day: '2026-03-10', sales: 2, revenue: 13_500 }]);
    expect(await byMethod(db, range)).toEqual([
      { method: 'cash', sales: 1, revenue: 9000 },
      { method: 'qris', sales: 1, revenue: 4500 },
    ]);
  });
});
