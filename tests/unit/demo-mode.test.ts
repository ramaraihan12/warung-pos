import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from '@/server/auth';

const ORIGIN = 'http://localhost:3010';

// No session cookie on purpose. A live account route answers 401 before it does anything, so a
// 401 means the request got through and a 404 means it was stopped first.
async function statusOf(method: 'GET' | 'POST', path: string) {
  const request = new Request(`${ORIGIN}/api/auth${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body:
      method === 'POST'
        ? JSON.stringify({
            currentPassword: 'warung123',
            newPassword: 'something-else',
            newEmail: 'someone@example.test',
            name: 'x',
            providerId: 'credential',
          })
        : undefined,
  });
  return (await getAuth().handler(request)).status;
}

function dropCachedAuth() {
  delete (globalThis as { __auth?: unknown }).__auth;
}

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgresql://unused');
  vi.stubEnv('BETTER_AUTH_URL', ORIGIN);
  vi.stubEnv('BETTER_AUTH_SECRET', 'only-for-this-test-and-long-enough-to-pass');
  // Otherwise the limiter answers 429 and hides what the route itself would do.
  vi.stubEnv('AUTH_RATE_LIMIT', 'off');
  dropCachedAuth();
});

afterEach(() => {
  vi.unstubAllEnvs();
  dropCachedAuth();
});

describe('DEMO_MODE=on', () => {
  beforeEach(() => {
    vi.stubEnv('DEMO_MODE', 'on');
  });

  it.each([
    '/change-password',
    '/update-user',
    '/change-email',
    '/delete-user',
    '/delete-user/callback',
    '/request-password-reset',
    '/reset-password',
    '/verify-email',
    '/send-verification-email',
    '/unlink-account',
    '/link-social',
  ])('stops %s for both methods', async (path) => {
    expect(await statusOf('POST', path)).toBe(404);
    expect(await statusOf('GET', path)).toBe(404);
  });

  it.each([
    '/change-password/',
    '/change-password//',
    '//change-password',
    '/change%2Dpassword',
    '/%63hange-password',
    '/CHANGE-PASSWORD',
    '/x/../change-password',
    '/./change-password',
    '/change-password?a=1',
    '/update-user/',
    '//update-user',
    '/update%2Duser',
  ])('is not fooled by %s', async (path) => {
    expect(await statusOf('POST', path)).not.toBe(401);
    expect(await statusOf('POST', path)).not.toBe(200);
  });

  it('keeps the session route working', async () => {
    expect(await statusOf('GET', '/get-session')).toBe(200);
  });
});

describe.each([['unset'], ['off'], ['']])('DEMO_MODE %s', (value) => {
  beforeEach(() => {
    if (value !== 'unset') vi.stubEnv('DEMO_MODE', value);
  });

  it.each(['/change-password', '/update-user', '/change-email'])(
    'leaves %s as it always was',
    async (path) => {
      expect(await statusOf('POST', path)).toBe(401);
    },
  );
});
