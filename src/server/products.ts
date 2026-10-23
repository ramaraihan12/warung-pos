import { and, asc, gt, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import type { Db } from '@/db';
import { products } from '@/db/schema';
import type { CatalogProduct } from '@/lib/sync/protocol';

export const ProductInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(40),
  price: z.coerce.number().int().min(0).max(100_000_000),
  unit: z.string().trim().min(1).max(20),
  category: z.string().trim().min(1).max(40),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

const nextVersion = sql`nextval('catalog_version_seq')`;

export async function createProduct(db: Db, input: ProductInput) {
  const [row] = await db
    .insert(products)
    .values({ id: uuidv7(), ...input })
    .returning({ id: products.id });
  return row;
}

export async function updateProduct(db: Db, id: string, input: ProductInput) {
  await db
    .update(products)
    .set({ ...input, version: nextVersion })
    .where(sql`${products.id} = ${id}`);
}

/** Products are never deleted, only switched off, so old sales keep their reference. */
export async function setProductActive(db: Db, id: string, active: boolean) {
  await db
    .update(products)
    .set({ active, version: nextVersion })
    .where(sql`${products.id} = ${id}`);
}

export async function listProducts(db: Db) {
  return db.select().from(products).orderBy(asc(products.category), asc(products.name));
}

/** Everything that changed after `cursor`, oldest change first. Inactive rows are sent too, so devices can drop them. */
export async function catalogDelta(db: Db, cursor: number, limit = 500) {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      category: products.category,
      unit: products.unit,
      price: products.price,
      active: products.active,
      version: products.version,
    })
    .from(products)
    .where(and(gt(products.version, cursor)))
    .orderBy(asc(products.version))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page: CatalogProduct[] = hasMore ? rows.slice(0, limit) : rows;
  return { products: page, cursor: page.at(-1)?.version ?? cursor, hasMore };
}
