import { assertRupiah } from './money';

export type CartLine = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  unitPrice: number;
  qty: number;
};

export type Cart = { lines: CartLine[] };

export type CatalogItem = Pick<CartLine, 'name' | 'sku' | 'unit' | 'unitPrice'> & { id: string };

export const MAX_QTY_PER_LINE = 999;

export const emptyCart: Cart = { lines: [] };

export function addItem(cart: Cart, item: CatalogItem, qty = 1): Cart {
  if (!Number.isInteger(qty) || qty < 1) throw new RangeError('qty must be a positive integer');
  assertRupiah(item.unitPrice, 'unitPrice');
  const existing = cart.lines.find((l) => l.productId === item.id);
  if (existing) {
    return setQty(cart, item.id, existing.qty + qty);
  }
  return {
    lines: [
      ...cart.lines,
      {
        productId: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        unitPrice: item.unitPrice,
        qty: Math.min(qty, MAX_QTY_PER_LINE),
      },
    ],
  };
}

/** Setting qty to 0 or less removes the line. */
export function setQty(cart: Cart, productId: string, qty: number): Cart {
  if (!Number.isInteger(qty)) throw new RangeError('qty must be an integer');
  if (qty <= 0) return removeLine(cart, productId);
  const clamped = Math.min(qty, MAX_QTY_PER_LINE);
  return { lines: cart.lines.map((l) => (l.productId === productId ? { ...l, qty: clamped } : l)) };
}

export function removeLine(cart: Cart, productId: string): Cart {
  return { lines: cart.lines.filter((l) => l.productId !== productId) };
}

export function lineTotal(line: Pick<CartLine, 'unitPrice' | 'qty'>): number {
  return assertRupiah(line.unitPrice * line.qty, 'line total');
}

export function cartTotal(cart: Cart): number {
  return cart.lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

export function itemCount(cart: Cart): number {
  return cart.lines.reduce((sum, l) => sum + l.qty, 0);
}

export type Payment =
  | { ok: true; paid: number; change: number }
  | { ok: false; reason: 'empty-cart' | 'short'; shortBy: number };

/** Cash must cover the total. Change is paid minus total, never negative. */
export function payCash(total: number, tendered: number): Payment {
  assertRupiah(total, 'total');
  assertRupiah(tendered, 'tendered');
  if (total <= 0) return { ok: false, reason: 'empty-cart', shortBy: 0 };
  if (tendered < total) return { ok: false, reason: 'short', shortBy: total - tendered };
  return { ok: true, paid: tendered, change: tendered - total };
}

/** QRIS is recorded by hand after the customer pays on their phone, so paid equals total. */
export function payQris(total: number): Payment {
  assertRupiah(total, 'total');
  if (total <= 0) return { ok: false, reason: 'empty-cart', shortBy: 0 };
  return { ok: true, paid: total, change: 0 };
}

const NOTES = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000];

/** Quick-cash buttons: exact amount, then the next few banknotes that cover it. */
export function cashSuggestions(total: number): number[] {
  assertRupiah(total, 'total');
  if (total <= 0) return [];
  const out = new Set<number>([total]);
  for (const note of NOTES) {
    const rounded = Math.ceil(total / note) * note;
    if (rounded >= total) out.add(rounded);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

/** "3*8990001" means quantity 3 of that code. Anything else is a plain query. */
export function parseScanInput(raw: string): { qty: number; query: string } {
  const m = /^\s*(\d{1,3})\s*[*x]\s*(.+?)\s*$/i.exec(raw);
  if (m && m[1] && m[2]) {
    const qty = Number(m[1]);
    if (qty >= 1) return { qty, query: m[2] };
  }
  return { qty: 1, query: raw.trim() };
}
