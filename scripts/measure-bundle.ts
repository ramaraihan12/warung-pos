// Gzip size of the JavaScript the /pos route loads, from a real page load of a production build.
//
//   pnpm build && (start the server) && TEST_DATABASE_URL=<db> pnpm measure:bundle
//
// Files are read from .next/static and compressed with zlib's default gzip level, which is what
// most servers use. A page load lists which chunks /pos asks for; nothing is estimated.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { SEED_PASSWORD } from '../src/server/seed-data';

const base = process.env.BASE_URL ?? 'http://localhost:3010';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const scripts = new Set<string>();
await page.goto(`${base}/login`);
await page.getByLabel('Email').fill('kasir1@warungbusri.test');
await page.getByLabel('Kata sandi').fill(SEED_PASSWORD);
await page.getByRole('button', { name: 'Masuk' }).click();
await page.waitForURL('**/pos');
// A fresh load of /pos with an empty HTTP cache, so every chunk it needs is requested.
const fresh = await browser.newContext({
  storageState: await context.storageState(),
  serviceWorkers: 'block',
});
const freshPage = await fresh.newPage();
freshPage.on('response', (res) => {
  const url = new URL(res.url());
  if (url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js')) scripts.add(url.pathname);
});
await freshPage.goto(`${base}/pos`, { waitUntil: 'networkidle' });
await browser.close();

let raw = 0;
let gz = 0;
const rows: Array<[string, number, number]> = [];
for (const path of [...scripts].sort()) {
  const file = readFileSync(join('.next', decodeURIComponent(path.replace('/_next/', ''))));
  const zipped = gzipSync(file).length;
  raw += file.length;
  gz += zipped;
  rows.push([path.split('/').pop() ?? path, file.length, zipped]);
}
rows.sort((a, b) => b[2] - a[2]);
for (const [name, r, z] of rows)
  console.log(
    `${(z / 1024).toFixed(1).padStart(7)} KB gzip  ${(r / 1024).toFixed(1).padStart(7)} KB raw  ${name}`,
  );
console.log(
  `total: ${(gz / 1024).toFixed(1)} KB gzip, ${(raw / 1024).toFixed(1)} KB raw, ${rows.length} files`,
);
