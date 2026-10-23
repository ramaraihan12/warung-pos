import { sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { MAX_CLOCK_SKEW_MS } from '@/lib/sync/protocol';

export const SHOP_TZ = 'Asia/Jakarta';

export type Range = { from: Date; to: Date; fromDay: string; toDay: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function jakartaToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ }).format(now);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day range in shop time. Defaults to the last 7 days ending today. */
export function parseRange(from: string | undefined, to: string | undefined, now = new Date()): Range {
  const today = jakartaToday(now);
  const toDay = to && DAY.test(to) ? to : today;
  let fromDay = from && DAY.test(from) ? from : addDays(toDay, -6);
  if (fromDay > toDay) fromDay = toDay;
  return {
    fromDay,
    toDay,
    from: new Date(`${fromDay}T00:00:00+07:00`),
    to: new Date(`${addDays(toDay, 1)}T00:00:00+07:00`),
  };
}

type Row = Record<string, unknown>;

function rows<T extends Row>(result: Iterable<T>): T[] {
  return [...result];
}

// Dates go in as ISO strings: postgres.js cannot bind a Date inside a raw sql template.
const inRange = (r: Range) =>
  sql`s.client_created_at >= ${r.from.toISOString()}::timestamptz and s.client_created_at < ${r.to.toISOString()}::timestamptz`;

export async function summary(db: Db, r: Range) {
  const res = await db.execute<{ sales: number; revenue: number; items: number }>(sql`
    select count(*)::int as sales,
           coalesce(sum(s.total), 0)::int as revenue,
           coalesce(sum((select sum(qty) from sale_items i where i.sale_id = s.id)), 0)::int as items
    from sales s where ${inRange(r)}`);
  return rows(res)[0] ?? { sales: 0, revenue: 0, items: 0 };
}

export async function dailyTotals(db: Db, r: Range) {
  const res = await db.execute<{ day: string; sales: number; revenue: number }>(sql`
    select to_char(s.client_created_at at time zone ${SHOP_TZ}, 'YYYY-MM-DD') as day,
           count(*)::int as sales,
           sum(s.total)::int as revenue
    from sales s where ${inRange(r)}
    group by 1 order by 1`);
  return rows(res);
}

export async function byMethod(db: Db, r: Range) {
  const res = await db.execute<{ method: string; sales: number; revenue: number }>(sql`
    select s.method, count(*)::int as sales, sum(s.total)::int as revenue
    from sales s where ${inRange(r)}
    group by 1 order by 3 desc`);
  return rows(res);
}

export async function topProducts(db: Db, r: Range, limit = 10) {
  const res = await db.execute<{ name: string; qty: number; revenue: number }>(sql`
    select p.name, sum(i.qty)::int as qty, sum(i.line_total)::int as revenue
    from sale_items i
    join sales s on s.id = i.sale_id
    join products p on p.id = i.product_id
    where ${inRange(r)}
    group by p.id, p.name order by 2 desc, 3 desc limit ${limit}`);
  return rows(res);
}

export async function byCashier(db: Db, r: Range) {
  const res = await db.execute<{ name: string; sales: number; revenue: number }>(sql`
    select u.name, count(*)::int as sales, sum(s.total)::int as revenue
    from sales s join "user" u on u.id = s.cashier_id
    where ${inRange(r)}
    group by u.id, u.name order by 3 desc`);
  return rows(res);
}

export async function byDevice(db: Db, r: Range) {
  const res = await db.execute<{ name: string; sales: number; revenue: number }>(sql`
    select d.name, count(*)::int as sales, sum(s.total)::int as revenue
    from sales s join devices d on d.id = s.device_id
    where ${inRange(r)}
    group by d.id, d.name order by 3 desc`);
  return rows(res);
}

/**
 * Sales whose device clock was off by more than 5 minutes when the batch was sent.
 * The skew is measured at send time, not per sale, because an offline sale is always
 * received long after it was made and that gap says nothing about the clock.
 */
export async function skewedSales(db: Db, r: Range) {
  const res = await db.execute<{
    id: string;
    client_created_at: Date;
    received_at: Date;
    clock_skew_ms: number;
    device: string;
    total: number;
  }>(sql`
    select s.id, s.client_created_at, s.received_at, s.clock_skew_ms, d.name as device, s.total
    from sales s join devices d on d.id = s.device_id
    where ${inRange(r)} and abs(s.clock_skew_ms) > ${MAX_CLOCK_SKEW_MS}
    order by s.client_created_at desc limit 50`);
  return rows(res);
}

export async function salesForExport(db: Db, r: Range) {
  const res = await db.execute<{
    id: string;
    client_created_at: Date;
    received_at: Date;
    cashier: string;
    device: string;
    method: string;
    total: number;
    paid: number;
    change_given: number;
    items: number;
    clock_skew_ms: number;
  }>(sql`
    select s.id, s.client_created_at, s.received_at, u.name as cashier, d.name as device,
           s.method, s.total, s.paid, s.change_given,
           (select sum(qty) from sale_items i where i.sale_id = s.id)::int as items,
           s.clock_skew_ms
    from sales s
    join "user" u on u.id = s.cashier_id
    join devices d on d.id = s.device_id
    where ${inRange(r)}
    order by s.client_created_at`);
  return rows(res);
}

export async function listDevices(db: Db) {
  const res = await db.execute<{
    id: string;
    name: string;
    user_name: string;
    registered_at: Date;
    last_seen_at: Date | null;
    last_sync_at: Date | null;
    pending_count: number;
    failed_count: number;
    sales: number;
  }>(sql`
    select d.id, d.name, u.name as user_name, d.registered_at, d.last_seen_at, d.last_sync_at,
           d.pending_count, d.failed_count,
           (select count(*)::int from sales s where s.device_id = d.id) as sales
    from devices d join "user" u on u.id = d.user_id
    order by d.last_seen_at desc nulls last`);
  return rows(res);
}

/** Spreadsheet programs run text that starts with = + - @ as a formula, so those get a leading quote. */
export function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], data: unknown[][]): string {
  return [header, ...data].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
