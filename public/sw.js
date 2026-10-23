// Service worker for the POS shell. Hand-written on purpose; the strategy is small enough to read.
//
//   /_next/static/*   cache first. File names carry a content hash, so a cached copy never goes stale.
//   /pos (navigation)  network first with a 4 second timeout, then the last good copy. The HTML is
//                      per user, so it is only ever stored after a logged-in 200 response.
//   / and /login       when the network is gone, answer with the cached /pos so a reload at the till works.
//   /api/*, RSC fetches, everything else  not touched. Sync deals with its own failures.
//
// Sales do not depend on this file. They go to IndexedDB. This only makes sure the page that
// writes them can load with no network.

const VERSION = 'v1';
const STATIC = `warung-static-${VERSION}`;
const PAGES = `warung-pages-${VERSION}`;
const SHELL = '/pos';
// Next adds a Vary header to pages. The shell is looked up by URL only.
const MATCH = { ignoreVary: true };
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES]);
      for (const name of await caches.keys()) {
        if (name.startsWith('warung-') && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function shellFromCache() {
  const cache = await caches.open(PAGES);
  return cache.match(SHELL, MATCH);
}

async function posNavigation(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok && !response.redirected) await cache.put(SHELL, response.clone());
    return response;
  } catch {
    const cached = await cache.match(SHELL, MATCH);
    if (cached) return cached;
    throw new Error('offline and /pos was never cached');
  }
}

async function otherNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const shell = await shellFromCache();
    if (shell) return shell;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg') {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    if (url.pathname === SHELL) event.respondWith(posNavigation(request));
    else if (url.pathname === '/' || url.pathname === '/login') event.respondWith(otherNavigation(request));
  }
});

// The page tells the worker which files it needs. The first visit is not controlled by the worker
// yet, so these requests would otherwise never pass through it.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'precache') {
    event.waitUntil(
      (async () => {
        const statics = await caches.open(STATIC);
        let stored = 0;
        for (const raw of data.urls || []) {
          const url = new URL(raw, self.location.origin);
          if (url.origin !== self.location.origin || !url.pathname.startsWith('/_next/static/')) continue;
          try {
            if (await statics.match(url.href, MATCH)) {
              stored++;
              continue;
            }
            const response = await fetch(url.href);
            if (response.ok) {
              await statics.put(url.href, response);
              stored++;
            }
          } catch {
            // one missing file should not stop the rest
          }
        }
        const pages = await caches.open(PAGES);
        try {
          const page = await fetch(SHELL, { credentials: 'same-origin' });
          if (page.ok && !page.redirected) await pages.put(SHELL, page);
        } catch {
          // offline right now: the next successful visit stores it
        }
        const ready = Boolean(await pages.match(SHELL, MATCH));
        if (event.source) event.source.postMessage({ type: 'precached', stored, ready });
      })(),
    );
  }
  if (data.type === 'clear-pages') {
    event.waitUntil(caches.delete(PAGES));
  }
});
