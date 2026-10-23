import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db';
import { products, stockMovements } from '@/db/schema';

export type StockRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  active: boolean;
  stock: number;
};

/** Stock is the sum of movements. Receiving is positive, sales are negative. */
export async function stockLevels(db: Db): Promise<StockRow[]> {
  const stock = sql<number>`coalesce(sum(${stockMovements.delta}), 0)::int`;
  return db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      unit: products.unit,
      category: products.category,
      active: products.active,
      stock,
    })
    .from(products)
    .leftJoin(stockMovements, eq(stockMovements.productId, products.id))
    .groupBy(products.id)
    .orderBy(products.name);
}

export async function stockOf(db: Db, productId: string): Promise<number> {
  const [row] = await db
    .select({ stock: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::int` })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));
  return row?.stock ?? 0;
}

export type AttentionRow = StockRow & { lastSoldAt: Date | null; devices: string[] };

/**
 * Products whose stock went below zero. This happens when two devices sell the last item
 * while offline: both sales are kept, and the owner has to count the shelf.
 */
export async function attentionList(db: Db): Promise<AttentionRow[]> {
  const negative = (await stockLevels(db)).filter((r) => r.stock < 0);
  if (negative.length === 0) return [];
  const ids = negative.map((r) => r.id);
  const details = await db.execute<{ product_id: string; last_sold: Date; devices: string[] }>(sql`
    select m.product_id,
           max(m.created_at) as last_sold,
           array_agg(distinct d.name) as devices
    from stock_movements m
    join sales s on s.id = m.sale_id
    join devices d on d.id = s.device_id
    where m.kind = 'sale' and m.product_id in (${sql.join(
      ids.map((i) => sql`${i}::uuid`),
      sql`, `,
    )})
    group by m.product_id
  `);
  const byProduct = new Map([...details].map((r) => [r.product_id, r]));
  return negative.map((r) => ({
    ...r,
    lastSoldAt: byProduct.get(r.id)?.last_sold ?? null,
    devices: byProduct.get(r.id)?.devices ?? [],
  }));
}

export const ReceiveSchema = z.object({
  productId: z.uuid(),
  qty: z.coerce.number().int().min(1).max(100_000),
  note: z.string().trim().max(200).optional(),
});

export async function receiveStock(db: Db, input: z.infer<typeof ReceiveSchema>, userId: string) {
  await db.insert(stockMovements).values({
    productId: input.productId,
    delta: input.qty,
    kind: 'receive',
    note: input.note || null,
    createdBy: userId,
  });
}

export async function recentMovements(db: Db, limit = 15) {
  return db
    .select({
      id: stockMovements.id,
      name: products.name,
      delta: stockMovements.delta,
      kind: stockMovements.kind,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(sql`${stockMovements.kind} <> 'sale'`)
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}
