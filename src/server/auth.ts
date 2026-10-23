import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { getDb, schema } from '@/db';

export type Role = 'owner' | 'cashier';

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      // Accounts are created by the owner's seed or `pnpm user:add`, never by visitors.
      disableSignUp: true,
      minPasswordLength: 8,
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'cashier', input: false },
      },
    },
    session: {
      // A cashier who opens the shop at 7 should still be logged in at 7 the next morning.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [nextCookies()],
  });
}

const globalForAuth = globalThis as unknown as { __auth?: ReturnType<typeof createAuth> };

/** Built on first use so `next build` does not need a database. */
export function getAuth() {
  globalForAuth.__auth ??= createAuth();
  return globalForAuth.__auth;
}
