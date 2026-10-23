import { createDb } from '../src/db/index';
import { resetData, seedHistory, seedProducts, seedUsers } from '../src/server/seed';
import { SEED_PASSWORD, SEED_USERS } from '../src/server/seed-data';

// Usage: pnpm db:seed [--reset] [--history]
const args = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db, client } = createDb(url, 2);
if (args.has('--reset')) await resetData(db);
await seedUsers(db);
await seedProducts(db);
if (args.has('--history')) {
  const n = await seedHistory(db);
  console.log(`added ${n} made-up sales`);
}
await client.end();

console.log('seeded Warung Bu Sri (made-up data). Log in with:');
for (const u of SEED_USERS) console.log(`  ${u.email}  ${SEED_PASSWORD}  (${u.role})`);
