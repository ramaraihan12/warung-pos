'use client';

import { useEffect, useRef, useState } from 'react';
import { cashSuggestions, payCash, payQris } from '@/lib/cart';
import { formatRupiah, parseRupiah } from '@/lib/money';
import type { PaymentMethod } from '@/lib/sync/protocol';

export function PaymentDialog({
  total,
  onConfirm,
  onCancel,
}: {
  total: number;
  onConfirm: (method: PaymentMethod, paid: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tendered = parseRupiah(cash);
  const result = method === 'cash' ? payCash(total, tendered) : payQris(total);

  useEffect(() => {
    if (method === 'cash') inputRef.current?.focus();
  }, [method]);

  async function confirm() {
    if (!result.ok || busy) return;
    setBusy(true);
    await onConfirm(method, result.paid);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    else if (e.key === 'Enter') {
      e.preventDefault();
      void confirm();
    } else if (e.key === 'F1') {
      e.preventDefault();
      setMethod('cash');
    } else if (e.key === 'F3') {
      e.preventDefault();
      setMethod('qris');
    }
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={onKeyDown}
    >
      <div role="dialog" aria-label="Pembayaran" className="w-full max-w-sm rounded-lg bg-card p-5 shadow-xl">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Pembayaran</h2>
          <span className="num text-2xl font-semibold" data-testid="pay-total">
            {formatRupiah(total)}
          </span>
        </div>

        <div role="radiogroup" aria-label="Metode" className="mt-4 grid grid-cols-2 gap-2">
          {(['cash', 'qris'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              data-testid={`method-${m}`}
              className={`rounded-md border px-3 py-2 font-medium ${method === m ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line'}`}
            >
              {m === 'cash' ? 'Tunai (F1)' : 'QRIS (F3)'}
            </button>
          ))}
        </div>

        {method === 'cash' ? (
          <div className="mt-4">
            <label htmlFor="cash" className="block text-sm font-medium">
              Uang diterima
            </label>
            <input
              id="cash"
              ref={inputRef}
              inputMode="numeric"
              autoComplete="off"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder={formatRupiah(total)}
              data-testid="cash-input"
              className="num mt-1 w-full rounded-md border border-line px-3 py-2 text-xl"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {cashSuggestions(total).map((s) => (
                <button
                  key={s}
                  onClick={() => setCash(String(s))}
                  className="num rounded border border-line px-2.5 py-1 text-sm hover:bg-brand-soft"
                >
                  {s === total ? 'Uang pas' : formatRupiah(s)}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-sm text-muted">
                {result.ok || tendered === 0 ? 'Kembalian' : 'Kurang'}
              </span>
              <span
                className={`num text-2xl font-semibold ${!result.ok && tendered > 0 ? 'text-bad' : ''}`}
                data-testid="change"
              >
                {result.ok
                  ? formatRupiah(result.change)
                  : tendered === 0
                    ? formatRupiah(0)
                    : formatRupiah(result.shortBy)}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded bg-brand-soft px-3 py-2 text-sm">
            Pelanggan bayar lewat QRIS di HP-nya. Konfirmasi setelah uang masuk. Pembayaran dicatat manual,
            tidak ada sambungan ke penyedia QRIS.
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="rounded-md border border-line px-4 py-2">
            Batal (Esc)
          </button>
          <button
            onClick={() => void confirm()}
            disabled={!result.ok || busy}
            data-testid="confirm-pay"
            className="flex-1 rounded-md bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
          >
            Selesai (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
