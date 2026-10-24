import { getDb } from '@/db';
import { Card, Empty, td, th, when } from '@/components/ui';
import { listDevices } from '@/server/reports';
import { requirePageUser } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function DevicesPage() {
  await requirePageUser('owner');
  const devices = await listDevices(getDb());
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Perangkat</h1>
      <Card>
        {devices.length === 0 ? (
          <Empty>Belum ada perangkat. Perangkat terdaftar sendiri saat kasir membuka layar kasir.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="devices">
              <thead>
                <tr>
                  <th className={th}>Perangkat</th>
                  <th className={th}>Kasir terakhir</th>
                  <th className={th}>Terlihat</th>
                  <th className={th}>Sinkron terakhir</th>
                  <th className={`${th} text-right`}>Antrean</th>
                  <th className={`${th} text-right`}>Ditolak</th>
                  <th className={`${th} text-right`}>Penjualan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {devices.map((d) => (
                  <tr key={d.id} data-testid="device-row">
                    <td className={td}>
                      <div className="font-medium">{d.name}</div>
                      <div className="num text-xs text-muted">{d.id.slice(0, 8)}</div>
                    </td>
                    <td className={td}>{d.user_name}</td>
                    <td className={td}>{when(d.last_seen_at)}</td>
                    <td className={td}>{when(d.last_sync_at)}</td>
                    <td
                      className={`${td} num text-right ${d.pending_count > 0 ? 'font-semibold text-warn' : ''}`}
                    >
                      {d.pending_count}
                    </td>
                    <td
                      className={`${td} num text-right ${d.failed_count > 0 ? 'font-semibold text-bad' : ''}`}
                    >
                      {d.failed_count}
                    </td>
                    <td className={`${td} num text-right`}>{d.sales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Antrean adalah angka yang dilaporkan perangkat pada kontak terakhir. Perangkat yang sedang offline
          tidak bisa memperbarui angkanya, jadi lihat kolom Terlihat untuk tahu seberapa lama angka itu.
        </p>
      </Card>
    </div>
  );
}
