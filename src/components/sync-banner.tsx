'use client';

import { useEffect, useState } from 'react';
import type { SyncState } from '@/lib/client/use-sync';

function ago(ms: number | null, now: number): string {
  if (ms === null) return 'belum pernah';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'baru saja';
  if (s < 60) return `${s} detik lalu`;
  return `${Math.round(s / 60)} menit lalu`;
}

export function SyncBanner({
  state,
  shellReady,
  onRetry,
}: {
  state: SyncState;
  shellReady: boolean;
  onRetry: () => void;
}) {
  // Re-render every few seconds so "last synced" does not freeze.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const offline = !state.online;
  const unreachable = state.online && !state.reachable;
  const tone =
    offline || unreachable
      ? 'bg-warn-soft text-warn border-warn/30'
      : 'bg-brand-soft text-brand-dark border-brand/20';

  const headline = offline
    ? 'Offline. Penjualan tetap disimpan di perangkat ini.'
    : unreachable
      ? 'Server tidak terjangkau. Mencoba lagi otomatis.'
      : state.syncing
        ? 'Menyinkronkan...'
        : state.pending > 0
          ? 'Online. Menunggu sinkron.'
          : 'Online. Semua penjualan sudah tersinkron.';

  return (
    <div
      role="status"
      data-testid="sync-banner"
      data-online={state.online ? 'true' : 'false'}
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-sm ${tone}`}
    >
      <strong data-testid="sync-headline">{headline}</strong>
      <span data-testid="pending-count" data-count={state.pending}>
        Antrean: <span className="num font-semibold">{state.pending}</span>
      </span>
      {state.failed > 0 && (
        <span data-testid="failed-count" className="font-semibold text-bad">
          Ditolak server: {state.failed}
        </span>
      )}
      <span className="text-xs opacity-80">Sinkron terakhir: {ago(state.lastSyncAt, now)}</span>
      <span
        className="ml-auto flex items-center gap-3 text-xs"
        data-testid="offline-ready"
        data-ready={shellReady}
      >
        {shellReady ? 'Siap dipakai offline' : 'Menyiapkan mode offline...'}
        {state.online && (
          <button onClick={onRetry} className="rounded border border-current px-2 py-0.5 hover:bg-white/50">
            Sinkron sekarang
          </button>
        )}
      </span>
    </div>
  );
}
