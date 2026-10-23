import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { createDb } from '../src/db/index';
import { account, user } from '../src/db/schema';

// Usage: pnpm user:add <email> <name> <owner|cashier> <password>
const [email, name, role, password] = process.argv.slice(2);
if (!email || !name || (role !== 'owner' && role !== 'cashier') || !password || password.length < 8) {
  console.error('usage: pnpm user:add <email> <name> <owner|cashier> <password (8+ chars)>');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db, client } = createDb(url, 1);
const id = randomUUID();
await db.insert(user).values({ id, name, email: email.toLowerCase(), role, emailVerified: true });
await db.insert(account).values({
  id: randomUUID(),
  accountId: id,
  providerId: 'credential',
  userId: id,
  password: await hashPassword(password),
});
await client.end();
console.log(`created ${role} ${email}`);
