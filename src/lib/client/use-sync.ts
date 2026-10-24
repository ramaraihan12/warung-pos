'use client';

import { liveQuery } from 'dexie';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { LocalProduct } from '@/lib/sync/catalog';
import { localDb } from './db';
import {
  defaultDeviceName,
  flushNow,
  getDeviceId,
  outboxCounts,
  pullCatalog,
  sendHeartbeat,
} from './sync-client';

export type SyncState = {
  /** The browser's own idea of connectivity. */
  online: boolean;
  /** False after a request failed even though the browser thinks it is online. */
  reachable: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt: number | null;
  deviceId: string | null;
  catalogLoaded: boolean;
};

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const TICK_MS = 2000;
const CATALOG_EVERY_MS = 30_000;

/**
 * Keeps the local catalog fresh and the outbox empty. It runs on mount, when the browser comes
 * back online, after each sale, and on a short timer that only does work when something is due.
 */
export function useSyncLoop(userName: string) {
  const online = useOnline();
  const [state, setState] = useState<Omit<SyncState, 'online'>>({
    reachable: true,
    syncing: false,
    pending: 0,
    failed: 0,
    lastSyncAt: null,
    deviceId: null,
    catalogLoaded: false,
  });
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const busy = useRef(false);
  const lastCatalogPull = useRef(0);

  const patch = useCallback((p: Partial<Omit<SyncState, 'online'>>) => setState((s) => ({ ...s, ...p })), []);

  const run = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    patch({ syncing: true });
    try {
      const work = async () => {
        const deviceId = await getDeviceId();
        const name = defaultDeviceName(userName, deviceId);
        // Sales go first: a slow or failing catalog pull must never hold them back.
        const result = await flushNow();
        await sendHeartbeat(name);
        patch({ reachable: !result.error, ...(result.error ? {} : { lastSyncAt: Date.now() }) });
        if (Date.now() - lastCatalogPull.current > CATALOG_EVERY_MS) {
          // Stamp the attempt, not the success, so a down server is retried every 30 s and not every tick.
          lastCatalogPull.current = Date.now();
          await pullCatalog();
        }
      };
      // Two tabs of the POS must not flush the same outbox at once.
      if (navigator.locks) {
        await navigator.locks.request('warung-sync', { ifAvailable: true }, async (lock) => {
          if (lock) await work();
        });
      } else {
        await work();
      }
    } catch {
      patch({ reachable: false });
    } finally {
      busy.current = false;
      patch({ syncing: false });
    }
  }, [patch, userName]);

  useEffect(() => {
    void getDeviceId().then((deviceId) => patch({ deviceId }));
    const counts = liveQuery(() => outboxCounts()).subscribe({
      next: (c) => patch({ pending: c.pending, failed: c.failed }),
      error: () => {},
    });
    const catalog = liveQuery(() => localDb().products.toArray()).subscribe({
      next: (rows) => {
        setProducts(rows);
        patch({ catalogLoaded: true });
      },
      error: () => patch({ catalogLoaded: true }),
    });

    const goOnline = () => void run();
    window.addEventListener('online', goOnline);

    const kick = setTimeout(() => void run(), 0);
    const timer = setInterval(() => {
      if (!navigator.onLine || busy.current) return;
      void localDb()
        .outbox.where('status')
        .equals('pending')
        .toArray()
        .then((rows) => {
          const due = rows.some((r) => r.nextAttemptAt <= Date.now());
          if (due || Date.now() - lastCatalogPull.current > CATALOG_EVERY_MS) void run();
        });
    }, TICK_MS);

    return () => {
      counts.unsubscribe();
      catalog.unsubscribe();
      window.removeEventListener('online', goOnline);
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [patch, run]);

  return { state: { ...state, online }, products, syncNow: run };
}
