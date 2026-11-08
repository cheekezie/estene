import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import {
  ACTOR_TYPES,
  DELIVERY_PROOF_METHODS,
  SHIPMENT_SOURCES,
  ORIGIN_MODES,
  DELIVERY_MODES,
  type OriginMode,
  type DeliveryMode,
  SHIPMENT_STATUSES,
  PARCEL_SIZES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  SERVICE_LEVELS,
  type ActorType,
  type DeliveryProofMethod,
  type ShipmentSource,
  type ShipmentStatus,
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

export interface IShipmentEvent {
  status: ShipmentStatus;
  note?: string;
  actorType: ActorType | 'system';
  actorId?: Types.ObjectId;
  at: Date;
}

export type DispatchState = 'searching' | 'offered' | 'unassigned' | 'assigned';

export interface IShipment {
  _id: Types.ObjectId;
  trackingNumber: string;
  status: ShipmentStatus;
  source: ShipmentSource;
  /** Business client the shipment belongs to (phone booking on their behalf, or via the API). */
  client?: Types.ObjectId | null;
  /** The client's own shipment id; unique per client, used for idempotent API creates. */
  clientReference?: string;
  /** Warehousing order this shipment was packed from. */
  order?: Types.ObjectId | null;
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
  /** Sum of successful payments, kobo. Maintained by PaymentsService only. */
  amountPaid: number;
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
  events: IShipmentEvent[];
  /** How the parcel travels. Offices are set whenever it passes through one. */
  fulfilment: {
    originMode: OriginMode;
    deliveryMode: DeliveryMode;
    interstate: boolean;
    originOffice?: Types.ObjectId | null;
    destinationOffice?: Types.ObjectId | null;
  };
  /** The office holding the parcel right now (null while with a rider or in transit). */
  currentOffice?: Types.ObjectId | null;
  manifest?: Types.ObjectId | null;
  /**
   * Each rider job on this shipment: one `full` leg for door-to-door, or a
   * `first_mile` (to the office) and `last_mile` (from it). Partner riders are
   * paid per leg from `fare`.
   */
  riderLegs: {
    rider: Types.ObjectId;
    kind: 'full' | 'first_mile' | 'last_mile';
    fare: number;
    completedAt: Date;
  }[];
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

const shipmentSchema = new Schema<IShipment>(
  {
    trackingNumber: { type: String, required: true, unique: true },
    status: { type: String, enum: SHIPMENT_STATUSES, default: 'created' },
    source: { type: String, enum: SHIPMENT_SOURCES, required: true, default: 'web' },
    client: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    clientReference: String,
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
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
    amountPaid: { type: Number, default: 0 },
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
        status: { type: String, enum: SHIPMENT_STATUSES, required: true },
        note: String,
        actorType: { type: String, enum: [...ACTOR_TYPES, 'system'], required: true },
        actorId: Schema.Types.ObjectId,
        at: { type: Date, default: Date.now },
      },
    ],
    fulfilment: {
      originMode: { type: String, enum: ORIGIN_MODES, default: 'pickup' },
      deliveryMode: { type: String, enum: DELIVERY_MODES, default: 'door' },
      interstate: { type: Boolean, default: false },
      originOffice: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
      destinationOffice: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    },
    currentOffice: { type: Schema.Types.ObjectId, ref: 'Office', default: null, index: true },
    manifest: { type: Schema.Types.ObjectId, ref: 'Manifest', default: null },
    riderLegs: [
      {
        _id: false,
        rider: { type: Schema.Types.ObjectId, ref: 'Rider', required: true },
        kind: { type: String, enum: ['full', 'first_mile', 'last_mile'], required: true },
        fare: { type: Number, required: true },
        completedAt: { type: Date, default: Date.now },
      },
    ],
    deliveredAt: Date,
  },
  { timestamps: true },
);

shipmentSchema.index({ status: 1, createdAt: -1 });
shipmentSchema.index({ rider: 1, status: 1 });
shipmentSchema.index({ 'pickup.zone': 1, status: 1 });
shipmentSchema.index({ 'pickup.phone': 1, createdAt: -1 });
shipmentSchema.index({ client: 1, createdAt: -1 });
shipmentSchema.index({ order: 1 }, { partialFilterExpression: { order: { $type: 'objectId' } } });
shipmentSchema.index(
  { client: 1, clientReference: 1 },
  { unique: true, partialFilterExpression: { clientReference: { $type: 'string' } } },
);
shipmentSchema.index(
  { tagCode: 1 },
  { unique: true, partialFilterExpression: { tagCode: { $type: 'string' } } },
);

export const ShipmentModel = model<IShipment>('Shipment', shipmentSchema);

export type ShipmentDoc = HydratedDocument<IShipment>;
