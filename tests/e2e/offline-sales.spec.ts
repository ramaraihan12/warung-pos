import { expect, test } from '@playwright/test';
import { KASIR1, OWNER, login, pendingCount, resetShop, sell, waitUntilTillIsReady } from './helpers';

test.beforeEach(async () => {
  await resetShop();
});

test('cashier sells offline, reloads offline, then syncs and the owner sees the sales', async ({
  browser,
}) => {
  const till = await browser.newContext();
  const page = await till.newPage();

  await login(page, KASIR1);
  await waitUntilTillIsReady(page);
  await pendingCount(page, 0);

  // Network off. From here on nothing reaches the server.
  await till.setOffline(true);
  await expect(page.getByTestId('sync-banner')).toHaveAttribute('data-online', 'false');
  // Playwright's offline mode also blocks the service worker's own requests, so this is a real outage.
  const reach = await page.evaluate(() =>
    fetch('/api/catalog').then(
      () => 'reached',
      () => 'blocked',
    ),
  );
  expect(reach).toBe('blocked');

  // 2 x Teh Manis Botol 4.500 (cash 10.000), 1 Mi Instan Goreng 3.200 (QRIS), Beras 72.000 + Kopi Sachet 1.500 (cash 100.000)
  await sell(page, ['2*8990003003'], { cash: 10_000 });
  await sell(page, ['8990002001'], 'qris');
  await sell(page, ['8990001001', '8990003006'], { cash: 100_000 });
  await pendingCount(page, 3);

  // A hard reload with no network has to bring the till back, with the queue intact.
  await page.reload();
  await expect(page.getByTestId('search')).toBeVisible();
  await expect(page.getByTestId('catalog-count')).not.toHaveAttribute('data-count', '0');
  await pendingCount(page, 3);
  await expect(page.getByTestId('sync-banner')).toHaveAttribute('data-online', 'false');

  // The reloaded page still sells, which proves the catalog came from IndexedDB and the payment
  // dialog and outbox write work after a cached load. Mi Instan Kuah Soto 3.000, cash 5.000.
  await page.getByTestId('search').fill('beras');
  await expect(page.getByTestId('result').first()).toContainText('Beras');
  await sell(page, ['8990002002'], { cash: 5_000 });
  await pendingCount(page, 4);

  // Network back. The outbox should flush on its own.
  await till.setOffline(false);
  await pendingCount(page, 0);

  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  await login(ownerPage, OWNER);
  await ownerPage.waitForURL('**/owner');
  await ownerPage.goto('/owner/reports');
  await expect(ownerPage.getByTestId('sales-count')).toContainText('4');
  await expect(ownerPage.getByText('Rp 88.700').first()).toBeVisible();

  await ownerPage.goto('/owner/devices');
  const row = ownerPage.getByTestId('device-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Dina');
  await expect(row).toContainText('0');

  await till.close();
  await owner.close();
});
