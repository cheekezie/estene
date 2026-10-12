import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import {
  ACTOR_TYPES,
  DELIVERY_PROOF_METHODS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  PARCEL_SIZES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  SERVICE_LEVELS,
  type ActorType,
  type DeliveryProofMethod,
  type OrderSource,
  type OrderStatus,
  type ParcelSize,
  type PaymentMethod,
  type PaymentStatus,
  type ServiceLevel,
} from '@estene/contracts/enums';
import type { QuoteLine } from '@estene/contracts/pricing';

type GeoJSONPoint = { type: 'Point'; coordinates: [number, number] };

export interface IStop {
  contactName: string;
  phone: string;
  zone: Types.ObjectId;
  area: string;
  address: string;
  landmark?: string;
  location?: GeoJSONPoint;
}

export interface IOrderEvent {
  status: OrderStatus;
  note?: string;
  actorType: ActorType | 'system';
  actorId?: Types.ObjectId;
  at: Date;
}

export type DispatchState = 'searching' | 'offered' | 'unassigned' | 'assigned';

export interface IOrder {
  _id: Types.ObjectId;
  trackingNumber: string;
  status: OrderStatus;
  source: OrderSource;
  /** Business client the order belongs to (phone booking on their behalf, or via the API). */
  client?: Types.ObjectId | null;
  /** The client's own order id; unique per client, used for idempotent API creates. */
  externalReference?: string;
  pickup: IStop;
  dropoff: IStop;
  parcel: {
    size: ParcelSize;
    weightKg: number;
    description: string;
    fragile: boolean;
    declaredValue: number;
  };
  serviceLevel: ServiceLevel;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  estimate: {
    lines: QuoteLine[];
    subtotal: number;
    total: number;
    routeFare: number;
    pricingVersion: number;
  };
  finalAmount?: number;
  adjustment?: { from: number; to: number; reason?: string; at: Date; by: Types.ObjectId };
  rider?: Types.ObjectId | null;
  assignedAt?: Date;
  tagCode?: string;
  /** Recipient delivery PIN, AES-GCM encrypted so it can be re-sent. Never returned by the API. */
  pinCipher: string;
  pinAttempts: number;
  proof?: { method: DeliveryProofMethod; photoUrl?: string; receivedBy?: string; at: Date };
  dispatch: { state: DispatchState; attempts: number; declinedBy: Types.ObjectId[] };
  senderEmail?: string;
  notes?: string;
  events: IOrderEvent[];
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stopSchema = new Schema<IStop>(
  {
    contactName: { type: String, required: true },
    phone: { type: String, required: true },
    zone: { type: Schema.Types.ObjectId, ref: 'Zone', required: true },
    area: { type: String, required: true },
    address: { type: String, required: true },
    landmark: String,
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined },
    },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    trackingNumber: { type: String, required: true, unique: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'created' },
    source: { type: String, enum: ORDER_SOURCES, required: true, default: 'web' },
    client: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    externalReference: String,
    pickup: { type: stopSchema, required: true },
    dropoff: { type: stopSchema, required: true },
    parcel: {
      size: { type: String, enum: PARCEL_SIZES, required: true },
      weightKg: { type: Number, required: true },
      description: { type: String, required: true },
      fragile: { type: Boolean, default: false },
      declaredValue: { type: Number, default: 0 },
    },
    serviceLevel: { type: String, enum: SERVICE_LEVELS, required: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    estimate: {
      lines: [{ _id: false, code: String, label: String, amount: Number }],
      subtotal: Number,
      total: Number,
      routeFare: Number,
      pricingVersion: Number,
    },
    finalAmount: Number,
    adjustment: { from: Number, to: Number, reason: String, at: Date, by: Schema.Types.ObjectId },
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', default: null },
    assignedAt: Date,
    tagCode: String,
    pinCipher: { type: String, required: true, select: false },
    pinAttempts: { type: Number, default: 0 },
    proof: {
      method: { type: String, enum: DELIVERY_PROOF_METHODS },
      photoUrl: String,
      receivedBy: String,
      at: Date,
    },
    dispatch: {
      state: {
        type: String,
        enum: ['searching', 'offered', 'unassigned', 'assigned'],
        default: 'searching',
      },
      attempts: { type: Number, default: 0 },
      declinedBy: [{ type: Schema.Types.ObjectId, ref: 'Rider' }],
    },
    senderEmail: String,
    notes: String,
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
    deliveredAt: Date,
  },
  { timestamps: true },
);

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ rider: 1, status: 1 });
orderSchema.index({ 'pickup.zone': 1, status: 1 });
orderSchema.index({ 'pickup.phone': 1, createdAt: -1 });
orderSchema.index({ client: 1, createdAt: -1 });
orderSchema.index(
  { client: 1, externalReference: 1 },
  { unique: true, partialFilterExpression: { externalReference: { $type: 'string' } } },
);
orderSchema.index(
  { tagCode: 1 },
  { unique: true, partialFilterExpression: { tagCode: { $type: 'string' } } },
);

export const OrderModel = model<IOrder>('Order', orderSchema);

export type OrderDoc = HydratedDocument<IOrder>;
