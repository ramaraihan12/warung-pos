'use client';

import { useEffect, useState } from 'react';

function staticUrls(): string[] {
  const urls = new Set<string>();
  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((s) => urls.add(s.src));
  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
    )
    .forEach((l) => {
      if (l.href) urls.add(l.href);
    });
  for (const entry of performance.getEntriesByType('resource')) urls.add(entry.name);
  return [...urls].filter((u) => new URL(u).pathname.startsWith('/_next/static/'));
}

/**
 * Registers the service worker (production only) and asks it to store this page and the files it
 * loaded. Returns true once the worker confirms the shell is cached, which is when going offline is safe.
 */
export function useOfflineShell(): { ready: boolean; supported: boolean } {
  const [ready, setReady] = useState(false);
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

  useEffect(() => {
    if (!supported || process.env.NODE_ENV !== 'production') return;
    let cancelled = false;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'precached' && event.data.ready && !cancelled) setReady(true);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    void (async () => {
      try {
        // Ask the browser not to evict the outbox when disk is tight. It may still say no.
        void navigator.storage?.persist?.();
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const reg = await navigator.serviceWorker.ready;
        // The page may have finished loading before the worker took control, so ask once it is ready.
        reg.active?.postMessage({ type: 'precache', urls: staticUrls() });
      } catch {
        // No worker (private window, blocked): the POS still works while online.
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [supported]);

  return { ready, supported };
}

export function clearCachedPages() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: 'clear-pages' });
}
