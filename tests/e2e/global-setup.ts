import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from '../../src/db';

export default async function globalSetup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/warung_pos_test';
  const { db, client } = createDb(url, 1);
  await migrate(db, { migrationsFolder: './drizzle' });
  await client.end();
}
