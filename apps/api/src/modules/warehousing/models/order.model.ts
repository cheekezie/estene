import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import {
  ACTOR_TYPES,
  DELIVERY_MODES,
  PAYMENT_METHODS,
  SERVICE_LEVELS,
  type ActorType,
  type DeliveryMode,
  type PaymentMethod,
  type ServiceLevel,
} from '@estene/contracts/enums';
import {
  ORDER_SOURCES,
  ORDER_STATUSES,
  type OrderSource,
  type OrderStatus,
} from '@estene/contracts/warehouse';

/**
 * A warehousing order: ship these units from our shelf to this recipient.
 * Packing creates the shipment (`shipment`), which then carries the journey.
 */
export interface IOrder {
  _id: Types.ObjectId;
  client: Types.ObjectId;
  office: Types.ObjectId;
  number: string;
  /** The client's own order id; unique per client, used for idempotent creates. */
  reference?: string;
  source: OrderSource;
  status: OrderStatus;
  recipient: {
    contactName: string;
    phone: string;
    zone?: Types.ObjectId;
    area?: string;
    address?: string;
    landmark?: string;
  };
  deliveryMode: DeliveryMode;
  destinationOffice?: Types.ObjectId | null;
  serviceLevel: ServiceLevel;
  paymentMethod: PaymentMethod;
  lines: { product: Types.ObjectId; sku: string; name: string; qty: number }[];
  shipment?: Types.ObjectId | null;
  notes?: string;
  restockedAt?: Date;
  events: {
    status: OrderStatus;
    note?: string;
    actorType: ActorType | 'system';
    actorId?: Types.ObjectId;
    at: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}
export type OrderDoc = HydratedDocument<IOrder>;

const orderSchema = new Schema<IOrder>(
  {
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    office: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    number: { type: String, required: true, unique: true },
    reference: String,
    source: { type: String, enum: ORDER_SOURCES, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    recipient: {
      contactName: { type: String, required: true },
      phone: { type: String, required: true },
      zone: { type: Schema.Types.ObjectId, ref: 'Zone' },
      area: String,
      address: String,
      landmark: String,
    },
    deliveryMode: { type: String, enum: DELIVERY_MODES, default: 'door' },
    destinationOffice: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    serviceLevel: { type: String, enum: SERVICE_LEVELS, default: 'standard' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'on_account' },
    lines: [
      {
        _id: false,
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        sku: { type: String, required: true },
        name: { type: String, required: true },
        qty: { type: Number, required: true, min: 1 },
      },
    ],
    shipment: { type: Schema.Types.ObjectId, ref: 'Shipment', default: null },
    notes: String,
    restockedAt: Date,
    events: [
      {
        _id: false,
        status: { type: String, enum: ORDER_STATUSES, required: true },
        note: String,
        actorType: { type: String, enum: [...ACTOR_TYPES, 'system'], required: true },
        actorId: Schema.Types.ObjectId,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

orderSchema.index(
  { client: 1, reference: 1 },
  { unique: true, partialFilterExpression: { reference: { $type: 'string' } } },
);
orderSchema.index({ client: 1, createdAt: -1 });
orderSchema.index({ office: 1, status: 1, createdAt: 1 });
// Backorders are retried oldest-first when stock arrives.
orderSchema.index({ client: 1, status: 1, createdAt: 1 });

export const OrderModel = model<IOrder>('Order', orderSchema);
