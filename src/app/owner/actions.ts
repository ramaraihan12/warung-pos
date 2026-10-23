'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { createProduct, ProductInputSchema, setProductActive, updateProduct } from '@/server/products';
import { requirePageUser } from '@/server/session';
import { receiveStock, ReceiveSchema } from '@/server/stock';

export type FormState = { ok: boolean; message: string } | null;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export async function saveProduct(_prev: FormState, form: FormData): Promise<FormState> {
  await requirePageUser('owner');
  const parsed = ProductInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `${issue?.path.join('.') ?? 'form'}: ${issue?.message ?? 'tidak valid'}` };
  }
  const id = String(form.get('id') ?? '');
  try {
    if (id) await updateProduct(getDb(), id, parsed.data);
    else await createProduct(getDb(), parsed.data);
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: 'Kode/SKU itu sudah dipakai produk lain.' };
    throw err;
  }
  revalidatePath('/owner/products');
  return { ok: true, message: id ? 'Produk diperbarui.' : 'Produk ditambahkan.' };
}

export async function toggleProduct(form: FormData) {
  await requirePageUser('owner');
  await setProductActive(getDb(), String(form.get('id')), form.get('active') === 'true');
  revalidatePath('/owner/products');
}

export async function receive(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser('owner');
  const parsed = ReceiveSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: 'Pilih produk dan isi jumlah (bilangan bulat, minimal 1).' };
  await receiveStock(getDb(), parsed.data, user.id);
  revalidatePath('/owner/stock');
  revalidatePath('/owner');
  return { ok: true, message: 'Stok masuk dicatat.' };
}
