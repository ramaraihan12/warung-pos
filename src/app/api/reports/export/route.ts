import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { MAX_CLOCK_SKEW_MS } from '@/lib/sync/protocol';
import { parseRange, salesForExport, toCsv } from '@/server/reports';
import { getApiUser } from '@/server/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getApiUser(request, 'owner');
  if (!user) return NextResponse.json({ error: 'owner only' }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get('from') ?? undefined, params.get('to') ?? undefined);
  const data = await salesForExport(getDb(), range);

  const csv = toCsv(
    ['sale_id', 'sold_at', 'received_at', 'cashier', 'device', 'method', 'total', 'paid', 'change', 'items', 'clock_skew_ms', 'clock_flagged'],
    data.map((r) => [
      r.id,
      r.client_created_at,
      r.received_at,
      r.cashier,
      r.device,
      r.method,
      r.total,
      r.paid,
      r.change_given,
      r.items,
      r.clock_skew_ms,
      Math.abs(r.clock_skew_ms) > MAX_CLOCK_SKEW_MS ? 'yes' : 'no',
    ]),
  );
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="penjualan-${range.fromDay}-${range.toDay}.csv"`,
    },
  });
}
