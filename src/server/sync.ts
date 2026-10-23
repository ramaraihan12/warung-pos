import { inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { devices, products, saleItems, sales, stockMovements, user } from '@/db/schema';
import {
  SaleEventSchema,
  SyncRequestSchema,
  type Ack,
  type Rejection,
  type SaleEvent,
  type SyncResponse,
} from '@/lib/sync/protocol';

export type ProcessInput = {
  /** The logged-in user who sent the batch. */
  userId: string;
  body: unknown;
  now?: Date;
};

export class BadRequestError extends Error {}

/**
 * Applies one batch of sale events. Safe to call again with the same events: a sale id that
 * already exists is acknowledged as a duplicate and changes nothing. A sale is never refused
 * because of stock. The customer already has the goods, so the sale is kept and stock may go
 * negative, which the owner sees in the attention list.
 */
export async function processSyncBatch(db: Db, input: ProcessInput): Promise<SyncResponse> {
  const now = input.now ?? new Date();
  const parsed = SyncRequestSchema.safeParse(input.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'invalid request');
  const { deviceId, sentAt, events: rawEvents } = parsed.data;
  const clockSkewMs = clamp32(new Date(sentAt).getTime() - now.getTime());

  const rejected: Rejection[] = [];
  const valid: SaleEvent[] = [];
  const seen = new Set<string>();
  const acks: Ack[] = [];

  for (const raw of rawEvents) {
    const event = SaleEventSchema.safeParse(raw);
    if (!event.success) {
      const id = typeof (raw as { id?: unknown } | null)?.id === 'string' ? (raw as { id: string }).id : null;
      rejected.push({ id, reason: `invalid event: ${event.error.issues[0]?.message ?? 'bad shape'}` });
      continue;
    }
    const e = event.data;
    if (seen.has(e.id)) {
      acks.push({ id: e.id, status: 'duplicate' });
      continue;
    }
    seen.add(e.id);
    const problem = checkMoney(e);
    if (problem) rejected.push({ id: e.id, reason: problem });
    else valid.push(e);
  }

  // References are checked up front so the insert below cannot half-fail on a foreign key.
  const productIds = [...new Set(valid.flatMap((e) => e.items.map((i) => i.productId)))];
  const knownProducts = new Set(
    productIds.length === 0
      ? []
      : (await db.select({ id: products.id }).from(products).where(inArray(products.id, productIds))).map(
          (r) => r.id,
        ),
  );
  const cashierIds = [...new Set(valid.map((e) => e.cashierId))];
  const knownCashiers = new Set(
    cashierIds.length === 0
      ? []
      : (await db.select({ id: user.id }).from(user).where(inArray(user.id, cashierIds))).map((r) => r.id),
  );

  const toInsert: SaleEvent[] = [];
  for (const e of valid) {
    if (!knownCashiers.has(e.cashierId)) rejected.push({ id: e.id, reason: 'unknown cashier' });
    else if (e.items.some((i) => !knownProducts.has(i.productId)))
      rejected.push({ id: e.id, reason: 'unknown product' });
    else toInsert.push(e);
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(devices)
      .values({
        id: deviceId,
        name: 'Perangkat baru',
        userId: input.userId,
        lastSeenAt: now,
        lastSyncAt: now,
      })
      .onConflictDoUpdate({
        target: devices.id,
        set: { userId: input.userId, lastSeenAt: now, lastSyncAt: now },
      });

    if (toInsert.length === 0) return;

    const inserted = await tx
      .insert(sales)
      .values(
        toInsert.map((e) => ({
          id: e.id,
          deviceId,
          cashierId: e.cashierId,
          method: e.method,
          total: e.total,
          paid: e.paid,
          changeGiven: e.paid - e.total,
          clientCreatedAt: new Date(e.clientCreatedAt),
          receivedAt: now,
          clockSkewMs,
        })),
      )
      .onConflictDoNothing({ target: sales.id })
      .returning({ id: sales.id });

    const created = new Set(inserted.map((r) => r.id));
    for (const e of toInsert) acks.push({ id: e.id, status: created.has(e.id) ? 'created' : 'duplicate' });

    const fresh = toInsert.filter((e) => created.has(e.id));
    if (fresh.length === 0) return;

    await tx.insert(saleItems).values(
      fresh.flatMap((e) =>
        e.items.map((i, idx) => ({
          saleId: e.id,
          line: idx + 1,
          productId: i.productId,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          lineTotal: i.qty * i.unitPrice,
        })),
      ),
    );

    // One movement per product per sale, even if the device sent the same product on two lines.
    const movements = fresh.flatMap((e) => {
      const perProduct = new Map<string, number>();
      for (const i of e.items) perProduct.set(i.productId, (perProduct.get(i.productId) ?? 0) + i.qty);
      return [...perProduct].map(([productId, qty]) => ({
        productId,
        delta: -qty,
        kind: 'sale',
        saleId: e.id,
        createdAt: new Date(e.clientCreatedAt),
      }));
    });
    await tx.insert(stockMovements).values(movements);
  });

  return { acks, rejected, serverTime: now.toISOString() };
}

function checkMoney(e: SaleEvent): string | null {
  const sum = e.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  if (sum !== e.total) return 'total does not match items';
  if (e.paid < e.total) return 'paid is less than total';
  return null;
}

function clamp32(n: number): number {
  return Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(n)));
}

export type DeviceHeartbeat = { id: string; name: string; pending: number; failed: number };

/** Registers a device or refreshes what it reports about itself. */
export async function recordHeartbeat(db: Db, userId: string, hb: DeviceHeartbeat, now = new Date()) {
  await db
    .insert(devices)
    .values({
      id: hb.id,
      name: hb.name,
      userId,
      lastSeenAt: now,
      pendingCount: hb.pending,
      failedCount: hb.failed,
    })
    .onConflictDoUpdate({
      target: devices.id,
      set: { name: hb.name, userId, lastSeenAt: now, pendingCount: hb.pending, failedCount: hb.failed },
    });
}
