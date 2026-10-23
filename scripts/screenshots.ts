// Takes the README screenshots from a running copy of the app (the Docker stack with seeded data).
//
//   docker compose up -d --build
//   docker compose --profile seed run --rm seed
//   pnpm screenshots
//
// It drives two cashiers and the owner in real browser contexts, the same way the e2e tests do.
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { SEED_PASSWORD } from '../src/server/seed-data';

const base = process.env.BASE_URL ?? 'http://localhost:3010';
const out = 'docs';
mkdirSync(out, { recursive: true });

async function login(page: Page, email: string) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

async function ready(page: Page) {
  await page.waitForURL('**/pos');
  await expect(page.getByTestId('catalog-count')).not.toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('offline-ready')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '0');
}

async function add(page: Page, code: string) {
  const search = page.getByTestId('search');
  await search.fill(code);
  await expect(page.getByTestId('result').first()).toBeVisible();
  await search.press('Enter');
}

async function payCash(page: Page, cash: number) {
  await page.getByTestId('search').press('F4');
  await page.getByTestId('cash-input').fill(String(cash));
}

async function drain(...pages: Page[]) {
  for (const p of pages) {
    await expect(p.getByTestId('pending-count')).toHaveAttribute('data-count', '0', { timeout: 30_000 });
  }
}

// One egg tray left on the shelf, so two offline sales will overshoot it.
execSync(
  `docker compose exec -T db psql -U postgres -d warung_pos -c "insert into stock_movements (product_id, delta, kind, note) select p.id, 1 - coalesce((select sum(delta) from stock_movements m where m.product_id = p.id), 0), 'adjust', 'hitung ulang' from products p where p.sku = '8990001007'"`,
  { stdio: 'inherit' },
);

const browser = await chromium.launch();
const view = { width: 1280, height: 800 };
const ctxA: BrowserContext = await browser.newContext({
  viewport: view,
  locale: 'id-ID',
  timezoneId: 'Asia/Jakarta',
});
const ctxB: BrowserContext = await browser.newContext({
  viewport: view,
  locale: 'id-ID',
  timezoneId: 'Asia/Jakarta',
});
const ctxO: BrowserContext = await browser.newContext({
  viewport: view,
  locale: 'id-ID',
  timezoneId: 'Asia/Jakarta',
});
const a = await ctxA.newPage();
const b = await ctxB.newPage();
const owner = await ctxO.newPage();

await login(a, 'kasir1@warungbusri.test');
await login(b, 'kasir2@warungbusri.test');
await login(owner, 'owner@warungbusri.test');
await ready(a);
await ready(b);

// 1. The till with a cart and search results.
await add(a, '2*8990003003');
await add(a, '8990002001');
await add(a, '8990001001');
await a.getByTestId('search').fill('kopi');
await expect(a.getByTestId('result').first()).toBeVisible();
await a.screenshot({ path: `${out}/pos.png` });
await a.getByTestId('search').fill('');

// 2. Offline, with sales waiting in the queue.
await ctxA.setOffline(true);
await ctxB.setOffline(true);
await expect(a.getByTestId('sync-banner')).toHaveAttribute('data-online', 'false');
await a.getByTestId('search').press('F8');
await add(a, '2*8990003003');
await add(a, '8990003006');
await payCash(a, 20_000);
await a.getByTestId('confirm-pay').click();
await expect(a.getByTestId('sale-done')).toBeVisible();
await a.getByRole('dialog', { name: 'Struk' }).screenshot({ path: `${out}/receipt.png` });
await a.getByTestId('new-sale').click();
await add(a, '8990001007');
await payCash(a, 30_000);
await a.getByTestId('confirm-pay').click();
await a.getByTestId('new-sale').click();
await add(b, '8990001007');
await payCash(b, 30_000);
await b.getByTestId('confirm-pay').click();
await b.getByTestId('new-sale').click();
await add(a, '8990002001');
await expect(a.getByTestId('pending-count')).toHaveAttribute('data-count', '2');
await a.screenshot({ path: `${out}/offline.png` });
await a.getByTestId('search').press('F8');

// 3. Back online, then the owner's views.
await ctxA.setOffline(false);
await ctxB.setOffline(false);
await drain(a, b);

await owner.goto(`${base}/owner`);
await expect(owner.getByTestId('attention-row')).toHaveCount(1);
await owner.screenshot({ path: `${out}/attention.png`, fullPage: true });
await owner.goto(`${base}/owner/reports`);
await expect(owner.getByTestId('daily')).toBeVisible();
await owner.screenshot({ path: `${out}/reports.png`, fullPage: true });

await browser.close();
console.log(`screenshots written to ${out}/`);
