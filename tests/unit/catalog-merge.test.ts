import { describe, expect, it } from 'vitest';
import { planCatalogMerge } from '@/lib/sync/catalog';
import type { CatalogProduct } from '@/lib/sync/protocol';

const row = (id: string, version: number, extra: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id,
  sku: `sku-${id}`,
  name: `Produk ${id}`,
  category: 'Lain',
  unit: 'pcs',
  price: 1000,
  active: true,
  version,
  ...extra,
});

describe('planCatalogMerge', () => {
  it('adds new products and moves the cursor to the highest version', () => {
    const plan = planCatalogMerge(new Map(), [row('a', 3), row('b', 7)], 0);
    expect(plan.upsert.map((p) => p.id)).toEqual(['a', 'b']);
    expect(plan.cursor).toBe(7);
  });

  it('strips the active flag from stored rows', () => {
    const plan = planCatalogMerge(new Map(), [row('a', 1)], 0);
    expect(plan.upsert[0]).not.toHaveProperty('active');
  });

  it('ignores a row that is not newer than the local copy', () => {
    const plan = planCatalogMerge(new Map([['a', 5]]), [row('a', 5), row('a', 4)], 5);
    expect(plan.upsert).toEqual([]);
    expect(plan.cursor).toBe(5);
  });

  it('keeps the newest version when one id appears twice in a delta', () => {
    const plan = planCatalogMerge(new Map(), [row('a', 2, { price: 1 }), row('a', 9, { price: 2 })], 0);
    expect(plan.upsert).toHaveLength(1);
    expect(plan.upsert[0]?.price).toBe(2);
  });

  it('deletes a product that became inactive', () => {
    const plan = planCatalogMerge(new Map([['a', 1]]), [row('a', 4, { active: false })], 1);
    expect(plan.remove).toEqual(['a']);
    expect(plan.upsert).toEqual([]);
  });

  it('does not try to delete a product it never had', () => {
    const plan = planCatalogMerge(new Map(), [row('z', 4, { active: false })], 0);
    expect(plan.remove).toEqual([]);
    expect(plan.cursor).toBe(4);
  });

  it('never moves the cursor backwards', () => {
    const plan = planCatalogMerge(new Map(), [row('a', 2)], 10);
    expect(plan.cursor).toBe(10);
  });
});
