import { defineConfig, devices } from '@playwright/test';

const PORT = 3010;
const dbUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/warung_pos_test';

// The e2e run uses the production build, because the service worker only registers there.
// Run `pnpm build` first. The app talks to the test database, never the dev one.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    timezoneId: 'Asia/Jakarta',
    locale: 'id-ID',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm start',
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: dbUrl,
      AUTH_RATE_LIMIT: 'off',
      BETTER_AUTH_SECRET: 'e2e-secret-0123456789abcdef0123456789abcdef',
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
