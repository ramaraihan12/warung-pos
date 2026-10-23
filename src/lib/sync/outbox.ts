import type { SaleEvent } from './protocol';

export type OutboxEntry = {
  /** Same as the sale id. */
  id: string;
  event: SaleEvent;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  /** "failed" means the server said this sale is invalid. It stays visible and is never retried. */
  status: 'pending' | 'failed';
  lastError?: string;
};

export type BackoffOptions = { baseMs?: number; capMs?: number; random?: () => number };

/**
 * Exponential backoff with jitter: 1s, 2s, 4s ... capped at 60s. The result is between
 * half of the nominal delay and the full delay, so many devices do not retry in lockstep.
 */
export function backoffDelay(
  attempts: number,
  { baseMs = 1000, capMs = 60_000, random = Math.random }: BackoffOptions = {},
): number {
  const nominal = Math.min(capMs, baseMs * 2 ** Math.max(0, attempts - 1));
  return Math.round(nominal / 2 + (random() * nominal) / 2);
}

export function newEntry(event: SaleEvent, now: number): OutboxEntry {
  return { id: event.id, event, createdAt: now, attempts: 0, nextAttemptAt: now, status: 'pending' };
}

/** Oldest first, only entries that are due, at most `size` of them. */
export function selectBatch(entries: OutboxEntry[], now: number, size: number): OutboxEntry[] {
  return entries
    .filter((e) => e.status === 'pending' && e.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, size);
}

export function markRetry(
  entry: OutboxEntry,
  now: number,
  error: string,
  opts?: BackoffOptions,
): OutboxEntry {
  const attempts = entry.attempts + 1;
  return { ...entry, attempts, nextAttemptAt: now + backoffDelay(attempts, opts), lastError: error };
}

export function markFailed(entry: OutboxEntry, error: string): OutboxEntry {
  return { ...entry, status: 'failed', lastError: error };
}

/** The soonest time anything pending becomes due, or null when nothing is waiting. */
export function nextDueAt(entries: OutboxEntry[]): number | null {
  let soonest: number | null = null;
  for (const e of entries) {
    if (e.status !== 'pending') continue;
    if (soonest === null || e.nextAttemptAt < soonest) soonest = e.nextAttemptAt;
  }
  return soonest;
}
