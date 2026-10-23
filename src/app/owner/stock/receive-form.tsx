'use client';

import { useActionState } from 'react';
import { inputClass, primaryButton } from '@/components/ui';
import { receive } from '../actions';

export function ReceiveForm({ options }: { options: Array<{ id: string; label: string }> }) {
  const [state, action, pending] = useActionState(receive, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6" data-testid="receive-form">
      <label className="text-xs font-medium sm:col-span-3">
        Produk
        <select name="productId" required className={`${inputClass} mt-1 block w-full`} defaultValue="">
          <option value="" disabled>
            Pilih produk
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium">
        Jumlah masuk
        <input
          name="qty"
          type="number"
          min={1}
          step={1}
          required
          className={`${inputClass} num mt-1 block w-full`}
        />
      </label>
      <label className="text-xs font-medium sm:col-span-2">
        Catatan
        <input
          name="note"
          maxLength={200}
          placeholder="mis. kulakan pasar"
          className={`${inputClass} mt-1 block w-full`}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-6">
        <button disabled={pending} className={primaryButton}>
          Catat stok masuk
        </button>
        {state && (
          <span role="status" className={`text-sm ${state.ok ? 'text-brand-dark' : 'text-bad'}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
