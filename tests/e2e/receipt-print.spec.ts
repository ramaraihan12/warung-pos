import { expect, test } from '@playwright/test';
import { KASIR1, login, resetShop, waitUntilTillIsReady } from './helpers';

test('the print stylesheet leaves only the receipt on the page', async ({ page }) => {
  await resetShop();
  await login(page, KASIR1);
  await waitUntilTillIsReady(page);

  const search = page.getByTestId('search');
  await search.fill('8990003003');
  await search.press('Enter');
  await search.press('F4');
  await page.getByTestId('cash-input').fill('5000');
  await expect(page.getByTestId('change')).toHaveText('Rp 500');
  await page.getByTestId('confirm-pay').click();
  await expect(page.getByTestId('receipt')).toContainText('Kembali');

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('receipt')).toBeVisible();
  await expect(page.getByTestId('search')).toBeHidden();
  await expect(page.getByTestId('sync-banner')).toBeHidden();
  const width = await page.getByTestId('receipt').evaluate((el) => el.getBoundingClientRect().width);
  // 58 mm is about 219 CSS pixels at 96 dpi.
  expect(Math.round(width)).toBeGreaterThanOrEqual(215);
  expect(Math.round(width)).toBeLessThanOrEqual(223);
});
