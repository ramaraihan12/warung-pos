import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { BodyTooLargeError, readLimitedText } from '@/server/body';
import { getApiUser } from '@/server/session';
import { recordHeartbeat } from '@/server/sync';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;

const Heartbeat = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  pending: z.number().int().min(0).max(1_000_000),
  failed: z.number().int().min(0).max(1_000_000),
});

/** A device calls this when it starts and after each sync attempt, so the owner can see it. */
export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: 'not logged in' }, { status: 401 });
  let json: unknown = null;
  try {
    json = JSON.parse(await readLimitedText(request, MAX_BODY_BYTES));
  } catch (err) {
    if (err instanceof BodyTooLargeError)
      return NextResponse.json({ error: 'body too large' }, { status: 413 });
  }
  const parsed = Heartbeat.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'bad heartbeat' }, { status: 400 });
  await recordHeartbeat(getDb(), user.id, parsed.data);
  return NextResponse.json({ ok: true, serverTime: new Date().toISOString() });
}
