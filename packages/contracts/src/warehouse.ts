import { z } from 'zod';
import {
  DELIVERY_MODES,
  PARCEL_SIZES,
  SERVICE_LEVELS,
  type DeliveryMode,
  type ParcelSize,
  type PaymentMethod,
  type ServiceLevel,
  type ShipmentStatus,
} from './enums';
import { NigerianPhoneSchema, ObjectIdSchema, PaginationQuerySchema } from './common';

/**
 * Warehousing: business clients keep stock in an Estene office (`isWarehouse`)
 * and send us orders. Packing an order creates a normal shipment from that
 * office, so the shipment stays the one record of the journey.
 */

// ── Statuses ────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  'awaiting_stock', // received, but not enough available stock to reserve every line
  'ready_to_pick', // stock reserved, waiting for the warehouse
  'picking', // staff are collecting the items
  'shipped', // packed and handed into the network as a shipment
  'delivered',
  'returned', // the shipment came back (or was cancelled after packing): needs a restock decision
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }
> = {
  awaiting_stock: { label: 'Awaiting stock', tone: 'warning' },
  ready_to_pick: { label: 'Ready to pick', tone: 'info' },
  picking: { label: 'Picking', tone: 'info' },
  shipped: { label: 'Shipped', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  returned: { label: 'Returned', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * Orders can be cancelled freely until packed. A packed order can still be
 * cancelled while its parcel waits at the warehouse counter with no rider.
 */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'awaiting_stock',
  'ready_to_pick',
  'picking',
];

/** The order mirrors its shipment once shipped. */
export function orderStatusForShipment(s: ShipmentStatus): OrderStatus | null {
  if (s === 'delivered' || s === 'collected') return 'delivered';
  if (s === 'returned' || s === 'cancelled') return 'returned';
  return null;
}

export const ORDER_SOURCES = ['admin', 'api', 'portal'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/** Recipients pay nothing, or just the delivery fee in cash. Item-value COD comes later. */
export const ORDER_PAYMENT_METHODS = ['on_account', 'cash_on_delivery'] as const;

export const INBOUND_STATUSES = ['expected', 'received', 'cancelled'] as const;
export type InboundStatus = (typeof INBOUND_STATUSES)[number];

/** Every change to on-hand stock is one append-only movement. */
export const STOCK_MOVEMENT_TYPES = [
  'received', // counted in from an inbound
  'shipped', // packed into a shipment
  'adjusted', // manual correction after a count (signed)
  'restocked', // a returned order went back on the shelf
  'written_off', // damaged or lost
  'transferred_out', // left this warehouse for another
  'transferred_in', // arrived from another warehouse (or a cancelled transfer came back)
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  received: 'Received',
  shipped: 'Shipped',
  adjusted: 'Adjusted',
  restocked: 'Restocked',
  written_off: 'Written off',
  transferred_out: 'Transferred out',
  transferred_in: 'Transferred in',
};

// ── Client settings ─────────────────────────────────────────────────────────

export const WarehousingSettingsSchema = z.object({
  enabled: z.boolean(),
  officeId: ObjectIdSchema,
  /** Flag products at or below this available quantity. */
  lowStockThreshold: z.number().int().nonnegative().max(100_000).default(5),
});
export type WarehousingSettingsInput = z.infer<typeof WarehousingSettingsSchema>;

export type WarehousingSettingsDto = {
  enabled: boolean;
  office: { id: string; name: string; code: string };
  lowStockThreshold: number;
  enabledAt: string | null;
};

// ── Products ────────────────────────────────────────────────────────────────

const SkuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._\-/]+$/, 'Use letters, numbers, dot, dash, underscore or slash');

export const ProductInputSchema = z.object({
  sku: SkuSchema,
  name: z.string().trim().min(2).max(120),
  barcode: z.string().trim().max(64).optional(),
  /** Packed size of one unit — the pack form suggests the order's parcel size from it. */
  size: z.enum(PARCEL_SIZES).default('small'),
  weightKg: z.number().positive().max(100),
  /** Value of one unit in kobo; summed into the shipment's declared value. */
  declaredValue: z.number().int().nonnegative().default(0),
  fragile: z.boolean().default(false),
  imageUrl: z.url().max(500).optional(),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;
export type ProductFormInput = z.input<typeof ProductInputSchema>;

export const ProductUpdateSchema = ProductInputSchema.omit({ sku: true }).partial();

export const ProductListQuerySchema = PaginationQuerySchema.extend({
  clientId: ObjectIdSchema.optional(),
  active: z.enum(['true', 'false']).optional(),
});

export type ProductDto = {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  size: ParcelSize;
  weightKg: number;
  declaredValue: number;
  fragile: boolean;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
};

// ── Stock ───────────────────────────────────────────────────────────────────

export const StockQuerySchema = PaginationQuerySchema.extend({
  clientId: ObjectIdSchema.optional(),
  officeId: ObjectIdSchema.optional(),
  lowOnly: z.enum(['true', 'false']).optional(),
});

export type StockLevelDto = {
  product: Pick<ProductDto, 'id' | 'sku' | 'name' | 'size' | 'isActive'>;
  office: { id: string; name: string; code: string };
  onHand: number;
  reserved: number;
  available: number;
  bin: string | null;
  low: boolean;
  updatedAt: string;
};

export const StockAdjustSchema = z.object({
  productId: ObjectIdSchema,
  officeId: ObjectIdSchema,
  /** Signed change to on-hand, e.g. -2 after a recount. */
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, 'Enter a change other than zero'),
  type: z.enum(['adjusted', 'written_off']).default('adjusted'),
  reason: z.string().trim().min(5).max(300),
});
export type StockAdjustInput = z.infer<typeof StockAdjustSchema>;

export const SetBinSchema = z.object({
  productId: ObjectIdSchema,
  officeId: ObjectIdSchema,
  bin: z.string().trim().toUpperCase().max(20).nullable(),
});

export const MovementQuerySchema = PaginationQuerySchema.extend({
  clientId: ObjectIdSchema.optional(),
  productId: ObjectIdSchema.optional(),
});

export type StockMovementDto = {
  id: string;
  type: StockMovementType;
  product: { id: string; sku: string; name: string };
  office: { code: string };
  qty: number;
  onHandAfter: number;
  reference: string | null;
  note: string | null;
  by: string | null;
  at: string;
};

// ── Inbound ─────────────────────────────────────────────────────────────────

const LineRefSchema = z
  .object({ productId: ObjectIdSchema.optional(), sku: SkuSchema.optional() })
  .refine((l) => !!l.productId || !!l.sku, { message: 'Give a productId or sku', path: ['sku'] });

export const InboundCreateSchema = z.object({
  /** The client's own reference, e.g. their purchase order. Unique per client. */
  reference: z.string().trim().min(1).max(64).optional(),
  officeId: ObjectIdSchema.optional(),
  expectedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(LineRefSchema.and(z.object({ expectedQty: z.number().int().positive().max(100_000) })))
    .min(1, 'Add at least one product')
    .max(200),
});
export type InboundCreateInput = z.infer<typeof InboundCreateSchema>;

export const AdminInboundCreateSchema = InboundCreateSchema.extend({ clientId: ObjectIdSchema });

/** What the warehouse actually counted. Lines not listed count as zero received. */
export const InboundReceiveSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: ObjectIdSchema,
        receivedQty: z.number().int().nonnegative().max(100_000),
        damagedQty: z.number().int().nonnegative().max(100_000).default(0),
      }),
    )
    .min(1),
  notes: z.string().trim().max(500).optional(),
});
export type InboundReceiveInput = z.infer<typeof InboundReceiveSchema>;

/**
 * Moves units from one warehouse to another. They leave the origin at once
 * and arrive as an inbound at the destination, counted like any delivery.
 */
export const StockTransferSchema = z
  .object({
    clientId: ObjectIdSchema,
    fromOfficeId: ObjectIdSchema,
    toOfficeId: ObjectIdSchema,
    lines: z
      .array(
        z.object({
          productId: ObjectIdSchema,
          qty: z.number().int().positive().max(100_000),
        }),
      )
      .min(1, 'Add at least one product')
      .max(200),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((t) => t.fromOfficeId !== t.toOfficeId, {
    message: 'Choose a different warehouse to move the stock to',
    path: ['toOfficeId'],
  });
export type StockTransferInput = z.infer<typeof StockTransferSchema>;

export const InboundListQuerySchema = PaginationQuerySchema.extend({
  clientId: ObjectIdSchema.optional(),
  officeId: ObjectIdSchema.optional(),
  status: z.enum(INBOUND_STATUSES).optional(),
});

export type InboundDto = {
  id: string;
  number: string;
  reference: string | null;
  client: { id: string; name: string };
  office: { id: string; name: string; code: string };
  /** Set when this inbound is stock moving in from another Estene warehouse. */
  transferFrom: { id: string; name: string; code: string } | null;
  status: InboundStatus;
  lines: {
    product: { id: string; sku: string; name: string };
    expectedQty: number;
    receivedQty: number;
    damagedQty: number;
  }[];
  expectedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  notes: string | null;
  createdAt: string;
};

// ── Orders ──────────────────────────────────────────────────────────────────

const RecipientSchema = z.object({
  contactName: z.string().trim().min(2),
  phone: NigerianPhoneSchema,
  zoneId: ObjectIdSchema.optional(),
  area: z.string().trim().min(2).optional(),
  address: z.string().trim().min(5).max(300).optional(),
  landmark: z.string().trim().max(120).optional(),
});

const OrderBaseSchema = z.object({
  /** The client's own order id. Sending the same one twice returns the original order. */
  reference: z.string().trim().min(1).max(64).optional(),
  recipient: RecipientSchema,
  deliveryMode: z.enum(DELIVERY_MODES).default('door'),
  destinationOfficeId: ObjectIdSchema.optional(),
  serviceLevel: z.enum(SERVICE_LEVELS).default('standard'),
  paymentMethod: z.enum(ORDER_PAYMENT_METHODS).default('on_account'),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(LineRefSchema.and(z.object({ qty: z.number().int().positive().max(10_000) })))
    .min(1, 'Add at least one product')
    .max(100),
});

function checkRecipient(o: z.output<typeof OrderBaseSchema>, ctx: z.RefinementCtx) {
  if (o.deliveryMode === 'collection') {
    if (!o.destinationOfficeId)
      ctx.addIssue({
        code: 'custom',
        path: ['destinationOfficeId'],
        message: 'Choose the office they will collect from',
      });
    return;
  }
  for (const field of ['zoneId', 'area', 'address'] as const)
    if (!o.recipient[field])
      ctx.addIssue({
        code: 'custom',
        path: ['recipient', field],
        message: field === 'address' ? 'Enter the address' : 'Choose an area',
      });
}

export const OrderCreateSchema = OrderBaseSchema.superRefine(checkRecipient);
export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;

export const AdminOrderCreateSchema = OrderBaseSchema.extend({
  clientId: ObjectIdSchema,
}).superRefine(checkRecipient);
export type AdminOrderCreateInput = z.infer<typeof AdminOrderCreateSchema>;
export type AdminOrderFormInput = z.input<typeof AdminOrderCreateSchema>;

export const OrderListQuerySchema = PaginationQuerySchema.extend({
  clientId: ObjectIdSchema.optional(),
  officeId: ObjectIdSchema.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;

/** Packing hands the order to the network: the tag and the parcel as weighed. */
export const OrderPackSchema = z.object({
  tagCode: z.string().trim().toUpperCase().min(6),
  size: z.enum(PARCEL_SIZES),
  weightKg: z.number().positive().max(100),
});
export type OrderPackInput = z.infer<typeof OrderPackSchema>;

/** A returned order: back on the shelf, or written off as damaged. */
export const OrderRestockSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: ObjectIdSchema,
        restockQty: z.number().int().nonnegative(),
        writeOffQty: z.number().int().nonnegative().default(0),
      }),
    )
    .min(1),
  note: z.string().trim().max(300).optional(),
});
export type OrderRestockInput = z.infer<typeof OrderRestockSchema>;

export type OrderEventDto = { status: OrderStatus; note?: string; actor: string; at: string };

export type OrderDto = {
  id: string;
  number: string;
  reference: string | null;
  source: OrderSource;
  client: { id: string; name: string };
  office: { id: string; name: string; code: string };
  status: OrderStatus;
  recipient: {
    contactName: string;
    phone: string;
    area: string | null;
    address: string | null;
    landmark: string | null;
    zone: { id: string; name: string } | null;
  };
  deliveryMode: DeliveryMode;
  destinationOffice: { id: string; name: string; code: string } | null;
  serviceLevel: ServiceLevel;
  paymentMethod: PaymentMethod;
  lines: {
    product: { id: string; sku: string; name: string; size: ParcelSize; weightKg: number };
    qty: number;
    bin: string | null;
  }[];
  /** Suggested parcel for the pack form: largest unit size, summed weight. */
  suggestedParcel: { size: ParcelSize; weightKg: number };
  shipment: { id: string; trackingNumber: string; status: ShipmentStatus } | null;
  notes: string | null;
  restockedAt: string | null;
  events: OrderEventDto[];
  createdAt: string;
};

export type WarehouseSummaryDto = {
  products: number;
  unitsOnHand: number;
  lowStock: number;
  openOrders: number;
  awaitingStock: number;
  expectedInbounds: number;
};

// ── Integration API views ───────────────────────────────────────────────────

export type IntegrationStockDto = {
  sku: string;
  name: string;
  onHand: number;
  reserved: number;
  available: number;
  warehouse: string;
};

export type IntegrationOrderDto = {
  id: string;
  number: string;
  reference: string | null;
  status: OrderStatus;
  statusLabel: string;
  recipient: { contactName: string; phone: string; area: string | null; address: string | null };
  deliveryMode: DeliveryMode;
  serviceLevel: ServiceLevel;
  lines: { sku: string; name: string; qty: number }[];
  shipment: {
    trackingNumber: string;
    trackingUrl: string;
    status: ShipmentStatus;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationInboundDto = {
  id: string;
  number: string;
  reference: string | null;
  status: InboundStatus;
  warehouse: string;
  /** Office code the stock is moving from, when this is a transfer between our warehouses. */
  transferFrom: string | null;
  lines: { sku: string; expectedQty: number; receivedQty: number; damagedQty: number }[];
  expectedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
};

/** Largest unit size and summed weight — what one parcel holding these lines probably looks like. */
export function suggestParcel(lines: { size: ParcelSize; weightKg: number; qty: number }[]) {
  const rank = (s: ParcelSize) => PARCEL_SIZES.indexOf(s);
  let size: ParcelSize = 'envelope';
  let weight = 0;
  for (const l of lines) {
    if (rank(l.size) > rank(size)) size = l.size;
    weight += l.weightKg * l.qty;
  }
  return { size, weightKg: Math.max(0.1, Math.round(weight * 100) / 100) };
}
