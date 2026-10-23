import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { getApiUser } from '@/server/session';
import { BadRequestError, processSyncBatch } from '@/server/sync';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: 'not logged in' }, { status: 401 });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'body too large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'body is not json' }, { status: 400 });
  }

  try {
    const result = await processSyncBatch(getDb(), { userId: user.id, body });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BadRequestError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('sync failed', err);
    return NextResponse.json({ error: 'sync failed' }, { status: 500 });
  }
}
