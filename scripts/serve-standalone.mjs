// Runs the standalone build the same way the Docker image does.
// `next build` leaves static files and public/ outside .next/standalone, so link them in first.
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) {
  console.error('No standalone build found. Run `pnpm build` first.');
  process.exit(1);
}

cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true });
if (existsSync(join(root, 'public')))
  cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true });

process.env.PORT ??= '3010';
// HOSTNAME is already set to the machine name on some systems, so use a separate variable.
process.env.HOSTNAME = process.env.HOST ?? 'localhost';
await import(pathToFileURL(join(standalone, 'server.js')).href);
