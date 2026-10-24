import { describe, expect, it } from 'vitest';
import {
  addItem,
  cartTotal,
  cashSuggestions,
  emptyCart,
  itemCount,
  parseScanInput,
  payCash,
  payQris,
  setQty,
} from '@/lib/cart';
import { formatRupiah, parseRupiah } from '@/lib/money';

const teh = { id: 'p1', name: 'Teh Manis Botol 450 ml', sku: '8990001', unit: 'botol', unitPrice: 4500 };
const mie = { id: 'p2', name: 'Mi Instan Goreng', sku: '8990002', unit: 'bungkus', unitPrice: 3200 };

describe('cart math', () => {
  it('merges the same product into one line', () => {
    const cart = addItem(addItem(emptyCart, teh), teh, 2);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.qty).toBe(3);
    expect(cartTotal(cart)).toBe(13_500);
  });

  it('sums lines as integers', () => {
    const cart = addItem(addItem(emptyCart, teh, 3), mie, 7);
    expect(cartTotal(cart)).toBe(3 * 4500 + 7 * 3200);
    expect(itemCount(cart)).toBe(10);
  });

  it('removes a line when qty drops to zero', () => {
    const cart = setQty(addItem(emptyCart, teh), 'p1', 0);
    expect(cart.lines).toEqual([]);
  });

  it('caps a line at 999', () => {
    const cart = addItem(emptyCart, teh, 2000);
    expect(cart.lines[0]?.qty).toBe(999);
  });

  it('rejects fractional quantities and prices', () => {
    expect(() => addItem(emptyCart, teh, 1.5)).toThrow(RangeError);
    expect(() => addItem(emptyCart, { ...teh, unitPrice: 4500.5 })).toThrow(RangeError);
  });

  it('does not drift the way floats would', () => {
    // 0.1 + 0.2 style errors cannot happen with integer rupiah.
    const cart = addItem(emptyCart, { ...teh, unitPrice: 1100 }, 3);
    expect(cartTotal(cart)).toBe(3300);
  });
});

describe('payment', () => {
  it('computes change for cash', () => {
    expect(payCash(13_500, 20_000)).toEqual({ ok: true, paid: 20_000, change: 6_500 });
    expect(payCash(13_500, 13_500)).toEqual({ ok: true, paid: 13_500, change: 0 });
  });

  it('reports how much is missing', () => {
    expect(payCash(13_500, 10_000)).toEqual({ ok: false, reason: 'short', shortBy: 3_500 });
  });

  it('refuses an empty cart', () => {
    expect(payCash(0, 5000).ok).toBe(false);
    expect(payQris(0).ok).toBe(false);
  });

  it('records qris as paid in full', () => {
    expect(payQris(13_500)).toEqual({ ok: true, paid: 13_500, change: 0 });
  });

  it('suggests the exact amount and covering banknotes', () => {
    expect(cashSuggestions(13_500)).toEqual([13_500, 14_000, 15_000, 20_000]);
    expect(cashSuggestions(50_000)).toEqual([50_000, 60_000, 100_000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});

describe('scan input', () => {
  it('reads a quantity prefix', () => {
    expect(parseScanInput('3*8990001')).toEqual({ qty: 3, query: '8990001' });
    expect(parseScanInput('12 x teh')).toEqual({ qty: 12, query: 'teh' });
  });

  it('leaves plain queries alone', () => {
    expect(parseScanInput('  teh botol ')).toEqual({ qty: 1, query: 'teh botol' });
    expect(parseScanInput('0*8990001')).toEqual({ qty: 1, query: '0*8990001' });
  });
});

describe('rupiah formatting', () => {
  it('groups thousands with dots', () => {
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(999)).toBe('Rp 999');
    expect(formatRupiah(12_500)).toBe('Rp 12.500');
    expect(formatRupiah(1_250_000)).toBe('Rp 1.250.000');
    expect(formatRupiah(-3_000)).toBe('-Rp 3.000');
  });

  it('parses typed cash', () => {
    expect(parseRupiah('50.000')).toBe(50_000);
    expect(parseRupiah('Rp 50 000')).toBe(50_000);
    expect(parseRupiah('abc')).toBe(0);
  });

  it('refuses non integers', () => {
    expect(() => formatRupiah(1.5)).toThrow(RangeError);
  });
});
