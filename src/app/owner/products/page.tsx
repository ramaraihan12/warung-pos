import { getDb } from '@/db';
import { Card, td, th } from '@/components/ui';
import { formatRupiah } from '@/lib/money';
import { listProducts } from '@/server/products';
import { toggleProduct } from '../actions';
import { ProductForm } from './product-form';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const rows = await listProducts(getDb());
  const categories = [...new Set(rows.map((r) => r.category))];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Produk</h1>
      <Card title="Produk baru">
        <div className="p-4">
          <ProductForm categories={categories} />
        </div>
      </Card>

      <Card title={`Daftar produk (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Nama</th>
                <th className={th}>Kode</th>
                <th className={th}>Kategori</th>
                <th className={`${th} text-right`}>Harga</th>
                <th className={th}>Satuan</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'text-muted'}>
                  <td className={td}>
                    <details>
                      <summary className="cursor-pointer font-medium">
                        {p.name}
                        {!p.active && <span className="ml-2 text-xs">(nonaktif)</span>}
                      </summary>
                      <div className="py-3">
                        <ProductForm categories={categories} initial={p} />
                      </div>
                    </details>
                  </td>
                  <td className={`${td} num`}>{p.sku}</td>
                  <td className={td}>{p.category}</td>
                  <td className={`${td} num text-right`}>{formatRupiah(p.price)}</td>
                  <td className={td}>{p.unit}</td>
                  <td className={td}>
                    <form action={toggleProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <button className="text-xs underline">{p.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Perubahan harga dan produk sampai ke kasir lewat sinkron katalog (tiap 30 detik saat online). Produk
          tidak dihapus, hanya dinonaktifkan, supaya penjualan lama tetap punya rujukan.
        </p>
      </Card>
    </div>
  );
}
