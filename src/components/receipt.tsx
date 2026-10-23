import { lineTotal } from '@/lib/cart';
import { formatRupiah } from '@/lib/money';
import { SHOP } from '@/lib/shop';
import type { SaleEvent } from '@/lib/sync/protocol';

const methodLabel = { cash: 'Tunai', qris: 'QRIS' } as const;

function stamp(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** 58 mm receipt. The `receipt` class carries the print CSS. */
export function Receipt({ sale, cashierName }: { sale: SaleEvent; cashierName: string }) {
  const change = sale.paid - sale.total;
  return (
    <div className="receipt" data-testid="receipt">
      <div style={{ textAlign: 'center' }}>
        <strong>{SHOP.name}</strong>
        <div>{SHOP.address}</div>
      </div>
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '4px 0' }} />
      <div>{stamp(sale.clientCreatedAt)}</div>
      <div>
        No {sale.id.slice(-6).toUpperCase()} / {cashierName}
      </div>
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '4px 0' }} />
      {sale.items.map((i, idx) => (
        <div key={idx} style={{ marginBottom: 2 }}>
          <div>{i.name}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {i.qty} x {formatRupiah(i.unitPrice).replace('Rp ', '')}
            </span>
            <span>{formatRupiah(lineTotal(i)).replace('Rp ', '')}</span>
          </div>
        </div>
      ))}
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '4px 0' }} />
      <Row label="Total" value={formatRupiah(sale.total)} bold />
      <Row label={methodLabel[sale.method]} value={formatRupiah(sale.paid)} />
      {sale.method === 'cash' && <Row label="Kembali" value={formatRupiah(change)} />}
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '4px 0' }} />
      <div style={{ textAlign: 'center' }}>Terima kasih</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
