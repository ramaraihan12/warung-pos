import { expect, test, type APIRequestContext } from '@playwright/test';
import { KASIR1, OWNER, login, resetShop } from './helpers';

const OWNER_PATHS = [
  '/owner',
  '/owner/reports?from=2020-01-01&to=2030-01-01',
  '/owner/devices',
  '/owner/stock',
  '/owner/products',
];

// The header Next.js sends when it already has the owner layout and only asks for the page below it.
const PAGE_ONLY_TREE = encodeURIComponent(
  JSON.stringify(['', { children: ['owner', { children: ['__PAGE__', {}] }] }]),
);

// Next answers a bare RSC request with a 307 to the same URL plus a cache-busting _rsc value.
// Follow that one hop, then return the real answer.
async function rscGet(request: APIRequestContext, path: string) {
  const headers = { RSC: '1', 'Next-Router-State-Tree': PAGE_ONLY_TREE };
  const first = await request.get(path, { headers, maxRedirects: 0 });
  const next = first.headers()['location'];
  if (first.status() === 307 && next?.includes('_rsc=')) {
    return request.get(next, { headers, maxRedirects: 0 });
  }
  return first;
}

test.beforeAll(async () => {
  await resetShop();
});

for (const path of OWNER_PATHS) {
  test(`anonymous visitors cannot read ${path}, even with a partial render request`, async ({ request }) => {
    const plain = await request.get(path, { maxRedirects: 0 });
    expect(plain.status()).toBe(307);
    expect(plain.headers()['location']).toContain('/login');

    const partial = await rscGet(request, path);
    const body = await partial.text();
    expect(body).not.toContain('Warung Bu Sri');
    expect(body).not.toContain('Telur Ayam');
    expect(body).not.toContain('data-testid');
  });
}

test('a cashier cannot read owner pages, even with a partial render request', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, KASIR1);
  await page.waitForURL('**/pos');
  for (const path of OWNER_PATHS) {
    const partial = await rscGet(context.request, path);
    const body = await partial.text();
    expect(body, path).not.toContain('Telur Ayam');
    expect(body, path).not.toContain('data-testid');
  }
  await context.close();

  // Control: the same partial request does return the page for the owner, so the checks above mean something.
  const owner = await browser.newContext();
  const op = await owner.newPage();
  await login(op, OWNER);
  await op.waitForURL('**/owner');
  const ok = await rscGet(owner.request, '/owner/products');
  expect(await ok.text()).toContain('Telur Ayam');
  await owner.close();
});

test('the api routes keep visitors and cashiers out', async ({ browser, request }) => {
  const sync = await request.post('/api/sync', { data: { deviceId: 'x', events: [] } });
  expect(sync.status()).toBe(401);
  expect((await request.get('/api/catalog')).status()).toBe(401);
  expect((await request.get('/api/reports/export')).status()).toBe(403);

  const cashier = await browser.newContext();
  const cp = await cashier.newPage();
  await login(cp, KASIR1);
  await cp.waitForURL('**/pos');
  expect((await cashier.request.get('/api/reports/export')).status()).toBe(403);
  const bad = await cashier.request.post('/api/sync', {
    headers: { 'content-type': 'application/json' },
    data: '{not json',
  });
  expect(bad.status()).toBe(400);
  const big = await cashier.request.post('/api/sync', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ pad: 'x'.repeat(2 * 1024 * 1024 + 10) }),
  });
  expect(big.status()).toBe(413);
  await cashier.close();

  const owner = await browser.newContext();
  const op = await owner.newPage();
  await login(op, OWNER);
  await op.waitForURL('**/owner');
  const csv = await owner.request.get('/api/reports/export');
  expect(csv.status()).toBe(200);
  await owner.close();
});
