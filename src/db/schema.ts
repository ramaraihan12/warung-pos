import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Tables owned by Better Auth. `role` is an extra column: "owner" or "cashier".
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('cashier'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every product insert or update takes the next number. Devices pull "everything after N". */
export const catalogVersion = pgSequence('catalog_version_seq');

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    category: text('category').notNull().default('Lain-lain'),
    unit: text('unit').notNull().default('pcs'),
    price: integer('price').notNull(),
    active: boolean('active').notNull().default(true),
    version: bigint('version', { mode: 'number' })
      .notNull()
      .default(sql`nextval('catalog_version_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('products_price_nonneg', sql`${t.price} >= 0`), index('products_version_idx').on(t.version)],
);

/** Stock is never stored as a number. It is the sum of these rows. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    delta: integer('delta').notNull(),
    kind: text('kind').notNull(),
    saleId: uuid('sale_id'),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_movements_product_idx').on(t.productId),
    check('stock_movements_kind', sql`${t.kind} in ('receive', 'sale', 'adjust')`),
    uniqueIndex('stock_movements_sale_product_idx')
      .on(t.saleId, t.productId)
      .where(sql`${t.saleId} is not null`),
  ],
);

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  /** As last reported by the device. A device that is offline cannot update it. */
  pendingCount: integer('pending_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
});

export const sales = pgTable(
  'sales',
  {
    /** UUIDv7 made on the device. It is the idempotency key for sync. */
    id: uuid('id').primaryKey(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    cashierId: text('cashier_id')
      .notNull()
      .references(() => user.id),
    method: text('method').notNull(),
    total: integer('total').notNull(),
    paid: integer('paid').notNull(),
    changeGiven: integer('change_given').notNull(),
    clientCreatedAt: timestamp('client_created_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    /** Device clock minus server clock at the moment the batch was sent, in ms. */
    clockSkewMs: integer('clock_skew_ms').notNull().default(0),
  },
  (t) => [
    check('sales_method', sql`${t.method} in ('cash', 'qris')`),
    check('sales_paid_covers_total', sql`${t.paid} >= ${t.total}`),
    index('sales_created_idx').on(t.clientCreatedAt),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    line: integer('line').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    name: text('name').notNull(),
    qty: integer('qty').notNull(),
    unitPrice: integer('unit_price').notNull(),
    lineTotal: integer('line_total').notNull(),
  },
  (t) => [primaryKey({ columns: [t.saleId, t.line] }), check('sale_items_qty', sql`${t.qty} > 0`)],
);
