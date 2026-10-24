import Link from 'next/link';
import { getDb } from '@/db';
import { Card, Empty, Stat, td, th, when } from '@/components/ui';
import { formatRupiah } from '@/lib/money';
import { listDevices, parseRange, skewedSales, summary } from '@/server/reports';
import { attentionList } from '@/server/stock';
import { requirePageUser } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function OwnerHome() {
  await requirePageUser('owner');
  const db = getDb();
  const today = parseRange(undefined, undefined);
  const day = parseRange(today.toDay, today.toDay);
  const [sum, attention, devices, skewed] = await Promise.all([
    summary(db, day),
    attentionList(db),
    listDevices(db),
    skewedSales(db, today),
  ]);
  const pending = devices.reduce((s, d) => s + d.pending_count, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ringkasan hari ini</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Penjualan" value={formatRupiah(sum.revenue)} hint={`${sum.sales} transaksi`} />
        <Stat label="Barang terjual" value={String(sum.items)} />
        <Stat
          label="Antrean di perangkat"
          value={String(pending)}
          hint="menurut laporan terakhir tiap perangkat"
        />
        <Stat
          label="Jam perangkat melenceng"
          value={String(skewed.length)}
          hint="7 hari terakhir, lebih dari 5 menit"
        />
      </div>

      <Card title="Perlu perhatian: stok minus" className={attention.length ? 'border-warn/40' : ''}>
        {attention.length === 0 ? (
          <Empty>Tidak ada. Stok semua produk nol atau lebih.</Empty>
        ) : (
          <>
            <p className="px-4 pt-3 text-sm text-warn">
              Produk ini terjual lebih banyak dari stok yang tercatat, biasanya karena dua perangkat menjual
              barang terakhir saat offline. Kedua penjualan tetap disimpan. Hitung rak, lalu catat stok masuk
              atau koreksi.
            </p>
            <table className="mt-2 w-full" data-testid="attention">
              <thead>
                <tr>
                  <th className={th}>Produk</th>
                  <th className={`${th} text-right`}>Stok</th>
                  <th className={th}>Terakhir terjual</th>
                  <th className={th}>Perangkat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {attention.map((r) => (
                  <tr key={r.id} data-testid="attention-row">
                    <td className={td}>
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-2 text-xs text-muted">{r.sku}</span>
                    </td>
                    <td className={`${td} num text-right font-semibold text-bad`}>
                      {r.stock} {r.unit}
                    </td>
                    <td className={td}>{when(r.lastSoldAt)}</td>
                    <td className={td}>{r.devices.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-sm">
              <Link href="/owner/stock" className="text-brand-dark underline">
                Catat stok masuk
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
