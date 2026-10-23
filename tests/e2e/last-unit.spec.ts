import { expect, test } from '@playwright/test';
import {
  KASIR1,
  KASIR2,
  OWNER,
  login,
  pendingCount,
  resetShop,
  sell,
  setStock,
  waitUntilTillIsReady,
} from './helpers';

const TELUR = '8990001007';

test('two offline devices sell the last unit: both sales land and stock goes to -1', async ({ browser }) => {
  await resetShop();
  await setStock(TELUR, 1);

  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  await login(pageA, KASIR1);
  await login(pageB, KASIR2);
  await waitUntilTillIsReady(pageA);
  await waitUntilTillIsReady(pageB);

  await a.setOffline(true);
  await b.setOffline(true);

  // Both cashiers see one egg on the shelf and sell it.
  await sell(pageA, [TELUR], { cash: 30_000 });
  await sell(pageB, [TELUR], { cash: 30_000 });
  await pendingCount(pageA, 1);
  await pendingCount(pageB, 1);

  await a.setOffline(false);
  await b.setOffline(false);
  await pendingCount(pageA, 0);
  await pendingCount(pageB, 0);

  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  await login(ownerPage, OWNER);
  await ownerPage.waitForURL('**/owner');

  const rows = ownerPage.getByTestId('attention-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Telur Ayam 1 kg');
  await expect(rows.first()).toContainText('-1');
  await expect(rows.first()).toContainText('Dina');
  await expect(rows.first()).toContainText('Anto');

  await ownerPage.goto('/owner/reports');
  await expect(ownerPage.getByTestId('sales-count')).toContainText('2');

  await a.close();
  await b.close();
  await owner.close();
});
