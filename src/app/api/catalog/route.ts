import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { catalogDelta } from '@/server/products';
import { getApiUser } from '@/server/session';

export const dynamic = 'force-dynamic';

/** GET /api/catalog?since=<version>&limit=<n>: products changed after the cursor, oldest change first. */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: 'not logged in' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const since = Number(params.get('since') ?? 0);
  const limit = Math.min(1000, Math.max(1, Number(params.get('limit') ?? 500)));
  if (!Number.isSafeInteger(since) || since < 0 || !Number.isInteger(limit)) {
    return NextResponse.json({ error: 'bad cursor' }, { status: 400 });
  }
  return NextResponse.json(await catalogDelta(getDb(), since, limit));
}
