import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(url: string, max = 10) {
  const client = postgres(url, { max, onnotice: () => {} });
  return { db: drizzle(client, { schema }), client };
}

const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof createDb> };

/** One pool per server process, kept across hot reloads in dev. */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  globalForDb.__db ??= createDb(url);
  return globalForDb.__db.db;
}

export { schema };
