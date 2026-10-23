import { describe, expect, it } from 'vitest';
import { looksLikeBarcode, searchProducts } from '@/lib/search';

const products = [
  { id: '1', name: 'Beras Pulen 5 kg', sku: '8990101', category: 'Sembako' },
  { id: '2', name: 'Minyak Goreng 1 L', sku: '8990102', category: 'Sembako' },
  { id: '3', name: 'Teh Celup Isi 25', sku: '8990201', category: 'Minuman' },
  { id: '4', name: 'Air Mineral 600 ml', sku: '8990202', category: 'Minuman' },
];

describe('searchProducts', () => {
  it('puts an exact barcode first', () => {
    expect(searchProducts(products, '8990202')[0]?.id).toBe('4');
  });

  it('matches name prefix and later words', () => {
    expect(searchProducts(products, 'teh').map((p) => p.id)).toEqual(['3']);
    expect(searchProducts(products, 'goreng').map((p) => p.id)).toEqual(['2']);
  });

  it('matches category as a last resort', () => {
    expect(searchProducts(products, 'minuman').map((p) => p.id)).toEqual(['4', '3']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchProducts(products, '   ')).toEqual([]);
  });
});

describe('looksLikeBarcode', () => {
  it('needs six or more digits', () => {
    expect(looksLikeBarcode('8990101')).toBe(true);
    expect(looksLikeBarcode('12345')).toBe(false);
    expect(looksLikeBarcode('teh')).toBe(false);
  });
});
