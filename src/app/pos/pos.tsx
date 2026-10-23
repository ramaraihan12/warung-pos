'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { Receipt } from '@/components/receipt';
import { SignOutButton } from '@/components/sign-out';
import { SyncBanner } from '@/components/sync-banner';
import {
  addItem,
  cartTotal,
  emptyCart,
  itemCount,
  lineTotal,
  parseScanInput,
  removeLine,
  setQty,
  type Cart,
} from '@/lib/cart';
import { enqueueSale } from '@/lib/client/sync-client';
import { useOfflineShell } from '@/lib/client/use-offline-shell';
import { useSyncLoop } from '@/lib/client/use-sync';
import { formatRupiah } from '@/lib/money';
import { searchProducts } from '@/lib/search';
import type { LocalProduct } from '@/lib/sync/catalog';
import type { PaymentMethod, SaleEvent } from '@/lib/sync/protocol';
import { PaymentDialog } from './payment-dialog';

type User = { id: string; name: string; role: 'owner' | 'cashier' };

export function Pos({ user }: { user: User }) {
  const { state, products, syncNow } = useSyncLoop(user.name);
  const shell = useOfflineShell();
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<SaleEvent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { qty, query: term } = useMemo(() => parseScanInput(query), [query]);
  const results = useMemo(() => searchProducts(products, term), [products, term]);
  const total = cartTotal(cart);
  const modalOpen = paying || receipt !== null;

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  const add = useCallback(
    (p: LocalProduct, n: number) => {
      setCart((c) => addItem(c, { id: p.id, name: p.name, sku: p.sku, unit: p.unit, unitPrice: p.price }, n));
      setQuery('');
      setActive(0);
      setNotice(null);
      focusSearch();
    },
    [focusSearch],
  );

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (term === '' && cart.lines.length > 0) {
        setPaying(true);
        return;
      }
      // A barcode scanner types the code and presses Enter, so an exact SKU match wins over the highlight.
      const exact = products.find((p) => p.sku === term);
      const pick = exact ?? results[active];
      if (pick) add(pick, qty);
      else if (term !== '') setNotice(`Produk "${term}" tidak ditemukan.`);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modalOpen) return;
      if (e.key === 'F2' || (e.key === '/' && document.activeElement !== searchRef.current)) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === 'F4' && cart.lines.length > 0) {
        e.preventDefault();
        setPaying(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        setCart(emptyCart);
        focusSearch();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, cart.lines.length, focusSearch]);

  async function completeSale(method: PaymentMethod, paid: number) {
    const sale: SaleEvent = {
      type: 'sale',
      id: uuidv7(),
      cashierId: user.id,
      clientCreatedAt: new Date().toISOString(),
      method,
      total,
      paid,
      items: cart.lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
    };
    // The sale is safe once this local write finishes. Nothing below needs the network.
    await enqueueSale(sale);
    setPaying(false);
    setReceipt(sale);
    setCart(emptyCart);
    void syncNow();
  }

  function closeReceipt() {
    setReceipt(null);
    setTimeout(focusSearch, 0);
  }

  const noCatalog = state.catalogLoaded && products.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-card px-4 py-2">
        <h1 className="text-lg font-semibold">Kasir</h1>
        <span className="text-sm text-muted">{user.name}</span>
        <span className="num text-xs text-muted" data-testid="catalog-count" data-count={products.length}>
          {products.length} produk
        </span>
        <nav className="ml-auto flex items-center gap-4 text-sm">
          {user.role === 'owner' && (
            <a href="/owner" className="text-brand underline">
              Laporan
            </a>
          )}
          <SignOutButton className="text-muted underline" />
        </nav>
      </header>
      <SyncBanner state={state} shellReady={shell.ready} onRetry={() => void syncNow()} />

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_24rem]">
        <section aria-label="Cari produk">
          <label htmlFor="search" className="block text-sm font-medium">
            Cari produk atau scan barcode
          </label>
          <input
            id="search"
            ref={searchRef}
            autoFocus
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setNotice(null);
            }}
            onKeyDown={onSearchKey}
            placeholder="Nama, kode, atau 3*kode untuk 3 buah"
            className="mt-1 w-full rounded-md border border-line px-4 py-3 text-lg"
            data-testid="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="results"
          />
          <p className="mt-1 text-xs text-muted">
            Enter tambah, panah pilih, F4 bayar, F8 batal, F2 atau / cari.
          </p>
          {notice && (
            <p role="alert" className="mt-2 rounded bg-bad-soft px-3 py-2 text-sm text-bad">
              {notice}
            </p>
          )}
          {noCatalog && (
            <p role="alert" className="mt-2 rounded bg-warn-soft px-3 py-2 text-sm text-warn">
              Katalog belum diunduh. Sambungkan internet sekali supaya daftar produk tersimpan di perangkat
              ini.
            </p>
          )}
          <ul
            id="results"
            role="listbox"
            className="mt-3 divide-y divide-line rounded-md border border-line bg-card"
          >
            {results.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(p, qty)}
                data-testid="result"
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2.5 ${i === active ? 'bg-brand-soft' : ''}`}
              >
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-muted">
                    {p.sku} / {p.unit}
                  </span>
                </span>
                <span className="num font-semibold">{formatRupiah(p.price)}</span>
              </li>
            ))}
            {results.length === 0 && term !== '' && (
              <li className="px-4 py-3 text-sm text-muted">Tidak ada yang cocok.</li>
            )}
            {term === '' && (
              <li className="px-4 py-3 text-sm text-muted">Ketik untuk mencari. Hasil muncul di sini.</li>
            )}
          </ul>
        </section>

        <aside aria-label="Keranjang" className="flex flex-col rounded-md border border-line bg-card">
          <h2 className="border-b border-line px-4 py-2 font-semibold">
            Keranjang <span className="num text-sm font-normal text-muted">({itemCount(cart)} barang)</span>
          </h2>
          <ul className="flex-1 divide-y divide-line overflow-auto" data-testid="cart">
            {cart.lines.length === 0 && <li className="px-4 py-6 text-sm text-muted">Belum ada barang.</li>}
            {cart.lines.map((l) => (
              <li key={l.productId} className="px-4 py-2.5" data-testid="cart-line">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{l.name}</span>
                  <span className="num font-semibold">{formatRupiah(lineTotal(l))}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                  <span className="num">{formatRupiah(l.unitPrice)}</span>
                  <button
                    aria-label={`Kurangi ${l.name}`}
                    className="ml-auto h-8 w-8 rounded border border-line text-ink"
                    onClick={() => setCart((c) => setQty(c, l.productId, l.qty - 1))}
                  >
                    -
                  </button>
                  <span className="num w-8 text-center text-ink">{l.qty}</span>
                  <button
                    aria-label={`Tambah ${l.name}`}
                    className="h-8 w-8 rounded border border-line text-ink"
                    onClick={() => setCart((c) => setQty(c, l.productId, l.qty + 1))}
                  >
                    +
                  </button>
                  <button
                    className="ml-2 text-bad underline"
                    onClick={() => setCart((c) => removeLine(c, l.productId))}
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Total</span>
              <span className="num text-3xl font-semibold" data-testid="total">
                {formatRupiah(total)}
              </span>
            </div>
            <button
              disabled={cart.lines.length === 0}
              onClick={() => setPaying(true)}
              data-testid="pay"
              className="mt-3 w-full rounded-md bg-brand px-4 py-3 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
            >
              Bayar (F4)
            </button>
          </div>
        </aside>
      </main>

      {paying && (
        <PaymentDialog
          total={total}
          onCancel={() => {
            setPaying(false);
            setTimeout(focusSearch, 0);
          }}
          onConfirm={completeSale}
        />
      )}

      {receipt && <ReceiptDialog sale={receipt} cashierName={user.name} onClose={closeReceipt} />}
    </div>
  );
}

function ReceiptDialog({
  sale,
  cashierName,
  onClose,
}: {
  sale: SaleEvent;
  cashierName: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4 print:static print:bg-transparent print:p-0">
      <div
        role="dialog"
        aria-label="Struk"
        className="max-h-full overflow-auto rounded-lg bg-card p-4 shadow-xl print:p-0 print:shadow-none"
      >
        <p className="mb-2 text-sm font-medium text-brand-dark print:hidden" data-testid="sale-done">
          Penjualan tersimpan.
        </p>
        <div className="border border-line print:border-0">
          <Receipt sale={sale} cashierName={cashierName} />
        </div>
        <div className="mt-3 flex gap-2 print:hidden">
          <button
            ref={ref}
            onClick={onClose}
            data-testid="new-sale"
            className="flex-1 rounded-md bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
          >
            Transaksi baru (Enter)
          </button>
          <button onClick={() => window.print()} className="rounded-md border border-line px-4 py-2">
            Cetak
          </button>
        </div>
      </div>
    </div>
  );
}
