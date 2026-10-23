import { getDb } from '@/db';
import { Card, td, th, when } from '@/components/ui';
import { recentMovements, stockLevels } from '@/server/stock';
import { ReceiveForm } from './receive-form';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const db = getDb();
  const [levels, movements] = await Promise.all([stockLevels(db), recentMovements(db)]);
  const active = levels.filter((l) => l.active);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stok</h1>
      <Card title="Stok masuk">
        <div className="p-4">
          <ReceiveForm
            options={active.map((l) => ({ id: l.id, label: `${l.name} (${l.stock} ${l.unit})` }))}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Stok sekarang">
          <p className="px-4 pt-3 text-xs text-muted">
            Stok adalah jumlah semua pergerakan: masuk positif, penjualan negatif. Dihitung di server, jadi
            angka ini hanya sebaru sinkron terakhir tiap perangkat.
          </p>
          <div className="max-h-[32rem] overflow-auto">
            <table className="mt-2 w-full">
              <thead>
                <tr>
                  <th className={th}>Produk</th>
                  <th className={th}>Kategori</th>
                  <th className={`${th} text-right`}>Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {levels.map((l) => (
                  <tr key={l.id} className={l.stock < 0 ? 'bg-bad-soft' : ''}>
                    <td className={td}>{l.name}</td>
                    <td className={td}>{l.category}</td>
                    <td className={`${td} num text-right ${l.stock < 0 ? 'font-semibold text-bad' : ''}`}>
                      {l.stock} {l.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Pergerakan terakhir (selain penjualan)">
          <ul className="divide-y divide-line">
            {movements.map((m) => (
              <li key={m.id} className="px-4 py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span>{m.name}</span>
                  <span className="num font-medium">{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                </div>
                <div className="text-xs text-muted">
                  {when(m.createdAt)}
                  {m.note ? ` / ${m.note}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
