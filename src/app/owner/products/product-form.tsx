'use client';

import { useActionState } from 'react';
import { inputClass, primaryButton } from '@/components/ui';
import { saveProduct } from '../actions';

type Initial = { id?: string; name: string; sku: string; price: number; unit: string; category: string };

export function ProductForm({ initial, categories }: { initial?: Initial; categories: string[] }) {
  const [state, action, pending] = useActionState(saveProduct, null);
  const listId = `categories-${initial?.id ?? 'new'}`;
  return (
    <form
      action={action}
      className="grid gap-3 sm:grid-cols-6"
      data-testid={initial ? 'edit-form' : 'new-product-form'}
    >
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <label className="text-xs font-medium sm:col-span-2">
        Nama
        <input
          name="name"
          required
          defaultValue={initial?.name}
          className={`${inputClass} mt-1 block w-full`}
        />
      </label>
      <label className="text-xs font-medium">
        Kode / barcode
        <input
          name="sku"
          required
          defaultValue={initial?.sku}
          className={`${inputClass} num mt-1 block w-full`}
        />
      </label>
      <label className="text-xs font-medium">
        Harga (rupiah)
        <input
          name="price"
          type="number"
          min={0}
          step={1}
          required
          defaultValue={initial?.price}
          className={`${inputClass} num mt-1 block w-full`}
        />
      </label>
      <label className="text-xs font-medium">
        Satuan
        <input
          name="unit"
          required
          defaultValue={initial?.unit ?? 'pcs'}
          className={`${inputClass} mt-1 block w-full`}
        />
      </label>
      <label className="text-xs font-medium">
        Kategori
        <input
          name="category"
          required
          list={listId}
          defaultValue={initial?.category}
          className={`${inputClass} mt-1 block w-full`}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <div className="flex items-center gap-3 sm:col-span-6">
        <button disabled={pending} className={primaryButton}>
          {initial ? 'Simpan perubahan' : 'Tambah produk'}
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
