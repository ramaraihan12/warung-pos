import { hashPassword } from 'better-auth/crypto';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Db } from '@/db';
import { account, devices, products, stockMovements, user } from '@/db/schema';
import type { SaleEvent } from '@/lib/sync/protocol';
import { SEED_PASSWORD, SEED_PRODUCTS, SEED_USERS } from './seed-data';
import { processSyncBatch } from './sync';

/** Empties every app table. Only used on dev and test databases. */
export async function resetData(db: Db) {
  await db.execute(sql`
    truncate table sale_items, sales, stock_movements, devices, products,
      session, account, verification, "user" restart identity cascade`);
}

export async function seedUsers(db: Db) {
  const password = await hashPassword(SEED_PASSWORD);
  for (const u of SEED_USERS) {
    await db
      .insert(user)
      .values({ id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: true })
      .onConflictDoNothing();
    await db
      .insert(account)
      .values({ id: `${u.id}-credential`, accountId: u.id, providerId: 'credential', userId: u.id, password })
      .onConflictDoNothing();
  }
}

export async function seedProducts(db: Db) {
  const owner = SEED_USERS[0].id;
  for (const p of SEED_PRODUCTS) {
    const id = uuidv7();
    const inserted = await db
      .insert(products)
      .values({ id, sku: p.sku, name: p.name, category: p.category, unit: p.unit, price: p.price })
      .onConflictDoNothing({ target: products.sku })
      .returning({ id: products.id });
    if (inserted.length > 0) {
      await db
        .insert(stockMovements)
        .values({ productId: id, delta: p.stock, kind: 'receive', note: 'stok awal', createdBy: owner });
    }
  }
}

// A tiny deterministic generator so the demo history is the same on every run.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A week of made-up sales, sent through the same code path as a real device. */
export async function seedHistory(db: Db, days = 7, now = new Date()) {
  const rand = mulberry32(42);
  const catalog = await db.select().from(products);
  if (catalog.length === 0) return 0;
  // A big delivery just before the first day, so a week of sales does not push shelves below zero.
  await db.insert(stockMovements).values(
    catalog.map((p) => ({
      productId: p.id,
      delta: 150,
      kind: 'receive',
      note: 'kulakan mingguan',
      createdBy: SEED_USERS[0].id,
      createdAt: new Date(now.getTime() - (days + 1) * 86_400_000),
    })),
  );
  const kasir = SEED_USERS.filter((u) => u.role === 'cashier');
  const deviceIds = kasir.map(() => uuidv7());
  const names = ['Kasir depan', 'Tablet samping'];
  for (const [i, id] of deviceIds.entries()) {
    await db
      .insert(devices)
      .values({ id, name: names[i] ?? `Perangkat ${i + 1}`, userId: kasir[i]!.id, lastSeenAt: now })
      .onConflictDoNothing();
  }

  // Cheap things sell more often.
  const weighted = catalog.flatMap((p) =>
    Array<typeof p>(Math.max(1, Math.round(60000 / (p.price + 5000)))).fill(p),
  );
  let count = 0;
  for (let d = days; d >= 0; d--) {
    const salesToday = d === 0 ? 8 : 18 + Math.floor(rand() * 14);
    const events: Array<{ deviceId: string; userId: string; event: SaleEvent }> = [];
    for (let n = 0; n < salesToday; n++) {
      const di = rand() < 0.65 ? 0 : 1;
      const lines = 1 + Math.floor(rand() * 4);
      const picked = new Map<string, { productId: string; name: string; qty: number; unitPrice: number }>();
      for (let l = 0; l < lines; l++) {
        const p = weighted[Math.floor(rand() * weighted.length)]!;
        const qty = 1 + Math.floor(rand() * (p.price < 5000 ? 5 : 2));
        const prev = picked.get(p.id);
        picked.set(p.id, { productId: p.id, name: p.name, qty: (prev?.qty ?? 0) + qty, unitPrice: p.price });
      }
      const items = [...picked.values()];
      const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      const method = rand() < 0.2 ? 'qris' : 'cash';
      const paid = method === 'qris' ? total : Math.ceil(total / 5000) * 5000;
      const at = new Date(now.getTime() - d * 86_400_000);
      at.setUTCHours(1 + Math.floor(rand() * 13), Math.floor(rand() * 60), Math.floor(rand() * 60));
      if (at > now) at.setTime(now.getTime() - (n + 1) * 60_000);
      events.push({
        deviceId: deviceIds[di]!,
        userId: kasir[di]!.id,
        event: {
          type: 'sale',
          id: uuidv7({ msecs: at.getTime() }),
          cashierId: kasir[di]!.id,
          clientCreatedAt: at.toISOString(),
          method,
          total,
          paid,
          items,
        },
      });
    }
    for (const di of [0, 1]) {
      const mine = events.filter((e) => e.deviceId === deviceIds[di]);
      if (mine.length === 0) continue;
      await processSyncBatch(db, {
        userId: kasir[di]!.id,
        now,
        body: { deviceId: deviceIds[di], sentAt: now.toISOString(), events: mine.map((m) => m.event) },
      });
      count += mine.length;
    }
  }
  return count;
}
