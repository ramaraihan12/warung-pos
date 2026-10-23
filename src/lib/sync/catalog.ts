import type { CatalogProduct } from './protocol';

export type LocalProduct = Omit<CatalogProduct, 'active'>;

export type CatalogPlan = {
  upsert: LocalProduct[];
  remove: string[];
  /** The highest version seen, so the next pull asks for everything after it. */
  cursor: number;
};

/**
 * Decides what a catalog delta does to the local copy. A row older than what we already
 * have is ignored (deltas can arrive twice or out of order), an inactive row deletes the
 * product locally, and the cursor only ever moves forward.
 */
export function planCatalogMerge(
  localVersions: ReadonlyMap<string, number>,
  delta: CatalogProduct[],
  cursor: number,
): CatalogPlan {
  const latest = new Map<string, CatalogProduct>();
  for (const row of delta) {
    const seen = latest.get(row.id);
    if (!seen || row.version > seen.version) latest.set(row.id, row);
  }

  const plan: CatalogPlan = { upsert: [], remove: [], cursor };
  for (const row of latest.values()) {
    plan.cursor = Math.max(plan.cursor, row.version);
    const have = localVersions.get(row.id);
    if (have !== undefined && have >= row.version) continue;
    if (!row.active) {
      if (have !== undefined) plan.remove.push(row.id);
      continue;
    }
    const { active: _active, ...product } = row;
    plan.upsert.push(product);
  }
  return plan;
}
