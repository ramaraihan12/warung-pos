import { getDb } from '@/db';
import { Card, Empty, Stat, inputClass, primaryButton, td, th, when } from '@/components/ui';
import { formatRupiah } from '@/lib/money';
import {
  byCashier,
  byDevice,
  byMethod,
  dailyTotals,
  parseRange,
  skewedSales,
  summary,
  topProducts,
} from '@/server/reports';
import { requirePageUser } from '@/server/session';

export const dynamic = 'force-dynamic';

const methodName: Record<string, string> = { cash: 'Tunai', qris: 'QRIS' };

type Props = { searchParams: Promise<{ from?: string; to?: string }> };

function Breakdown({
  rows,
  label,
}: {
  rows: Array<{ name: string; sales: number; revenue: number }>;
  label: string;
}) {
  return (
    <Card title={label}>
      {rows.length === 0 ? (
        <Empty>Belum ada penjualan.</Empty>
      ) : (
        <table className="w-full">
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className={td}>{r.name}</td>
                <td className={`${td} num text-right text-muted`}>{r.sales}x</td>
                <td className={`${td} num text-right font-medium`}>{formatRupiah(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default async function ReportsPage({ searchParams }: Props) {
  await requirePageUser('owner');
  const params = await searchParams;
  const range = parseRange(params.from, params.to);
  const db = getDb();
  const [sum, daily, methods, top, cashiers, devices, skewed] = await Promise.all([
    summary(db, range),
    dailyTotals(db, range),
    byMethod(db, range),
    topProducts(db, range),
    byCashier(db, range),
    byDevice(db, range),
    skewedSales(db, range),
  ]);
  const max = Math.max(1, ...daily.map((d) => d.revenue));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Laporan</h1>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-xs font-medium">
            Dari
            <input
              type="date"
              name="from"
              defaultValue={range.fromDay}
              className={`${inputClass} mt-1 block`}
            />
          </label>
          <label className="text-xs font-medium">
            Sampai
            <input type="date" name="to" defaultValue={range.toDay} className={`${inputClass} mt-1 block`} />
          </label>
          <button className={primaryButton}>Tampilkan</button>
          <a
            href={`/api/reports/export?from=${range.fromDay}&to=${range.toDay}`}
            className="rounded-md border border-line px-4 py-2 text-sm"
            data-testid="export-csv"
          >
            Unduh CSV
          </a>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Penjualan"
          value={formatRupiah(sum.revenue)}
          hint={`${range.fromDay} sampai ${range.toDay}`}
        />
        <Stat label="Transaksi" value={String(sum.sales)} testId="sales-count" />
        <Stat label="Barang terjual" value={String(sum.items)} />
      </div>

      <Card title="Per hari">
        {daily.length === 0 ? (
          <Empty>Belum ada penjualan di rentang ini.</Empty>
        ) : (
          <table className="w-full" data-testid="daily">
            <tbody className="divide-y divide-line">
              {daily.map((d) => (
                <tr key={d.day}>
                  <td className={`${td} num whitespace-nowrap`}>{d.day}</td>
                  <td className={`${td} w-full`}>
                    <div
                      className="h-3 rounded-sm bg-brand"
                      style={{ width: `${Math.max(2, (d.revenue / max) * 100)}%` }}
                    />
                  </td>
                  <td className={`${td} num text-right text-muted`}>{d.sales}x</td>
                  <td className={`${td} num whitespace-nowrap text-right font-medium`}>
                    {formatRupiah(d.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown
          label="Per metode bayar"
          rows={methods.map((m) => ({ ...m, name: methodName[m.method] ?? m.method }))}
        />
        <Breakdown label="Per kasir" rows={cashiers} />
        <Breakdown label="Per perangkat" rows={devices} />
        <Card title="Produk terlaris">
          {top.length === 0 ? (
            <Empty>Belum ada penjualan.</Empty>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-line">
                {top.map((p) => (
                  <tr key={p.name}>
                    <td className={td}>{p.name}</td>
                    <td className={`${td} num text-right text-muted`}>{p.qty} terjual</td>
                    <td className={`${td} num text-right font-medium`}>{formatRupiah(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Jam perangkat melenceng" className={skewed.length ? 'border-warn/40' : ''}>
        <p className="px-4 pt-3 text-xs text-muted">
          Selisih jam perangkat dan jam server saat batch dikirim lebih dari 5 menit. Waktu penjualan yang
          tercatat di perangkat itu mungkin salah. Jam diukur saat kirim, bukan saat jual, karena penjualan
          offline selalu sampai terlambat.
        </p>
        {skewed.length === 0 ? (
          <Empty>Tidak ada.</Empty>
        ) : (
          <table className="mt-2 w-full" data-testid="skewed">
            <thead>
              <tr>
                <th className={th}>Penjualan</th>
                <th className={th}>Perangkat</th>
                <th className={th}>Tercatat jam</th>
                <th className={`${th} text-right`}>Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {skewed.map((s) => (
                <tr key={s.id}>
                  <td className={`${td} num`}>{formatRupiah(s.total)}</td>
                  <td className={td}>{s.device}</td>
                  <td className={td}>{when(s.client_created_at)}</td>
                  <td className={`${td} num text-right`}>
                    {s.clock_skew_ms > 0 ? '+' : '-'}
                    {Math.round(Math.abs(s.clock_skew_ms) / 60000)} menit
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
