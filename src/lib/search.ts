export type Searchable = { id: string; name: string; sku: string; category: string };

/**
 * Ranks products for the POS search box. An exact SKU/barcode match wins, then SKU
 * prefix, then name prefix, then any word starting with the query, then substring.
 */
export function searchProducts<T extends Searchable>(products: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const scored: Array<{ p: T; score: number }> = [];
  for (const p of products) {
    const name = p.name.toLowerCase();
    const sku = p.sku.toLowerCase();
    let score = 0;
    if (sku === q) score = 100;
    else if (sku.startsWith(q)) score = 80;
    else if (name.startsWith(q)) score = 60;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 40;
    else if (name.includes(q) || p.category.toLowerCase().includes(q)) score = 20;
    if (score > 0) scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'id'));
  return scored.slice(0, limit).map((s) => s.p);
}

/** True when the text is a code a scanner would send: digits only, 6 or more of them. */
export function looksLikeBarcode(text: string): boolean {
  return /^\d{6,}$/.test(text.trim());
}
