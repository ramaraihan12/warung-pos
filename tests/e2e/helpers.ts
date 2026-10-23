import { expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../../src/db';
import { products, stockMovements } from '../../src/db/schema';
import { resetData, seedProducts, seedUsers } from '../../src/server/seed';
import { SEED_PASSWORD } from '../../src/server/seed-data';

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/warung_pos_test';

export const KASIR1 = 'kasir1@warungbusri.test';
export const KASIR2 = 'kasir2@warungbusri.test';
export const OWNER = 'owner@warungbusri.test';

/** Empties the test database and loads the made-up shop again. */
export async function resetShop() {
  const { db, client } = createDb(url, 1);
  try {
    await resetData(db);
    await seedUsers(db);
    await seedProducts(db);
  } finally {
    await client.end();
  }
}

/** Puts a product's stock at an exact number by adding one adjustment. */
export async function setStock(sku: string, target: number) {
  const { db, client } = createDb(url, 1);
  try {
    const [p] = await db.select().from(products).where(eq(products.sku, sku));
    if (!p) throw new Error(`no product ${sku}`);
    const rows = await db.select().from(stockMovements).where(eq(stockMovements.productId, p.id));
    const current = rows.reduce((s, r) => s + r.delta, 0);
    await db
      .insert(stockMovements)
      .values({ productId: p.id, delta: target - current, kind: 'adjust', note: 'e2e' });
  } finally {
    await client.end();
  }
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

/** Waits until the till has its catalog and the worker has cached the shell, so going offline is safe. */
export async function waitUntilTillIsReady(page: Page) {
  await page.waitForURL('**/pos');
  await expect(page.getByTestId('catalog-count')).not.toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('offline-ready')).toHaveAttribute('data-ready', 'true');
}

/** Rings up one sale by keyboard: type into the search box, Enter to add, F4 to pay. */
export async function sell(page: Page, items: string[], pay: { cash: number } | 'qris') {
  const search = page.getByTestId('search');
  for (const item of items) {
    await search.fill(item);
    await expect(page.getByTestId('result').first()).toBeVisible();
    await search.press('Enter');
  }
  await search.press('F4');
  if (pay === 'qris') {
    await page.getByTestId('method-qris').click();
  } else {
    await page.getByTestId('cash-input').fill(String(pay.cash));
  }
  await page.getByTestId('confirm-pay').click();
  await expect(page.getByTestId('sale-done')).toBeVisible();
  await page.getByTestId('new-sale').click();
}

export async function pendingCount(page: Page, expected: number) {
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', String(expected), {
    timeout: 30_000,
  });
}
