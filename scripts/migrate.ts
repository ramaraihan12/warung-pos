import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from '../src/db/index';

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db, client } = createDb(url, 1);
await migrate(db, { migrationsFolder: './drizzle' });
await client.end();
console.log('migrations applied');
