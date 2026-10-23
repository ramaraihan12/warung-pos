import { z } from 'zod';

export const MAX_BATCH = 100;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const rupiah = z.number().int().min(0).max(1_000_000_000);

export const SaleItemSchema = z.object({
  productId: z.uuid(),
  name: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(999),
  unitPrice: rupiah,
});

export const PaymentMethodSchema = z.enum(['cash', 'qris']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/** One sale as the device recorded it. The id is a client-generated UUIDv7 and is the idempotency key. */
export const SaleEventSchema = z.object({
  type: z.literal('sale'),
  id: z.uuid(),
  clientCreatedAt: z.iso.datetime(),
  method: PaymentMethodSchema,
  total: rupiah,
  paid: rupiah,
  items: z.array(SaleItemSchema).min(1).max(100),
});
export type SaleEvent = z.infer<typeof SaleEventSchema>;

/** Events are validated one by one on the server, so one bad sale does not sink the batch. */
export const SyncRequestSchema = z.object({
  deviceId: z.uuid(),
  sentAt: z.iso.datetime(),
  events: z.array(z.unknown()).min(1).max(MAX_BATCH),
});
export type SyncRequest = z.input<typeof SyncRequestSchema>;

export type Ack = { id: string; status: 'created' | 'duplicate' };
export type Rejection = { id: string | null; reason: string };
export type SyncResponse = { acks: Ack[]; rejected: Rejection[]; serverTime: string };

export const CatalogProductSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  unit: z.string(),
  price: z.number().int(),
  active: z.boolean(),
  version: z.number().int(),
});
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

export const CatalogResponseSchema = z.object({
  products: z.array(CatalogProductSchema),
  cursor: z.number().int(),
  hasMore: z.boolean(),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;
