// Time to sync N queued sales, measured in a real browser against a running production build.
//
//   pnpm build
//   DATABASE_URL=<test db> AUTH_RATE_LIMIT=off pnpm start     (another terminal)
//   TEST_DATABASE_URL=<test db> pnpm bench:sync [count] [runs]
//
// The browser goes offline, the outbox is filled directly in IndexedDB, then the network comes
// back and the clock runs until the outbox is empty. Everything is included: the browser, the
// Next.js route, request validation, Postgres inserts and the ack round trip.
import { chromium } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { createDb } from '../src/db/index';
import { resetData, seedProducts, seedUsers } from '../src/server/seed';
import { SEED_PASSWORD } from '../src/server/seed-data';

const base = process.env.BASE_URL ?? 'http://localhost:3010';
const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('TEST_DATABASE_URL is required, and the server must use the same database');
const count = Number(process.argv[2] ?? 1000);
const runs = Number(process.argv[3] ?? 3);

const timings: number[] = [];

for (let run = 1; run <= runs; run++) {
  const { db, client } = createDb(dbUrl, 1);
  await resetData(db);
  await seedUsers(db);
  await seedProducts(db);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel('Email').fill('kasir1@warungbusri.test');
  await page.getByLabel('Kata sandi').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/pos');
  await page.waitForFunction(
    () => document.querySelector('[data-testid=catalog-count]')?.getAttribute('data-count') !== '0',
  );
  await page.waitForFunction(
    () => document.querySelector('[data-testid=pending-count]')?.getAttribute('data-count') === '0',
  );

  await page.waitForFunction(
    () => document.querySelector('[data-testid=offline-ready]')?.getAttribute('data-ready') === 'true',
  );
  await context.setOffline(true);

  const ids = Array.from({ length: count }, () => uuidv7());
  await page.evaluate(
    async ({ ids }) => {
      const open = indexedDB.open('warung-pos');
      const idb = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const products = await new Promise<Array<{ id: string; name: string; price: number }>>((resolve) => {
        const req = idb.transaction('products').objectStore('products').getAll();
        req.onsuccess = () => resolve(req.result);
      });
      const tx = idb.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const now = Date.now();
      ids.forEach((id, i) => {
        // Three lines per sale, spread over the whole catalog.
        const items = [0, 1, 2].map((k) => {
          const p = products[(i * 7 + k * 13) % products.length]!;
          return { productId: p.id, name: p.name, qty: 1 + ((i + k) % 3), unitPrice: p.price };
        });
        const total = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
        store.put({
          id,
          createdAt: now + i,
          attempts: 0,
          nextAttemptAt: now,
          status: 'pending',
          event: {
            type: 'sale',
            id,
            cashierId: 'user-kasir1',
            clientCreatedAt: new Date(now - (ids.length - i) * 1000).toISOString(),
            method: i % 5 === 0 ? 'qris' : 'cash',
            total,
            paid: Math.ceil(total / 1000) * 1000,
            items,
          },
        });
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      idb.close();
    },
    { ids },
  );

  // Dexie's live queries do not see writes made straight to IndexedDB, so reload (offline, from the
  // service worker cache) and let the page read the filled outbox.
  await page.reload();
  await page.waitForFunction(
    (n) => document.querySelector('[data-testid=pending-count]')?.getAttribute('data-count') === String(n),
    count,
  );

  // The clock starts when the network returns, and stops when the last ack has been applied.
  const started = Date.now();
  await context.setOffline(false);
  await page.waitForFunction(
    () => document.querySelector('[data-testid=pending-count]')?.getAttribute('data-count') === '0',
    undefined,
    { timeout: 120_000, polling: 25 },
  );
  const elapsed = Date.now() - started;
  timings.push(elapsed);

  const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from sales`);
  const stored = [...rows][0]?.n;
  console.log(`run ${run}: ${count} sales synced in ${elapsed} ms (${stored} rows in postgres)`);

  await browser.close();
  await client.end();
}

timings.sort((a, b) => a - b);
const median = timings[Math.floor(timings.length / 2)]!;
console.log(
  `median of ${runs}: ${median} ms for ${count} sales (${Math.round(count / (median / 1000))} sales/s)`,
);
