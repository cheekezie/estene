import { Schema, model, type Types } from 'mongoose';
import {
  CLIENT_STATUSES,
  WEBHOOK_EVENTS,
  type ClientStatus,
  type WebhookEvent,
} from '@estene/contracts/enums';
import {
  CLIENT_INDUSTRIES,
  MONTHLY_VOLUMES,
  type ClientIndustry,
  type MonthlyVolume,
} from '@estene/contracts/client';

/**
 * API keys are stored as SHA-256 hashes; the plaintext is shown once at
 * creation. The webhook signing secret must be readable to sign payloads, so
 * it is AES-GCM encrypted instead of hashed.
 */
export interface IApiKey {
  _id: Types.ObjectId;
  name: string;
  hash: string;
  preview: string;
  createdAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

export interface IFreePeriod {
  _id: Types.ObjectId;
  fromCycle: number;
  toCycle: number;
  reason: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

export interface IClient {
  _id: Types.ObjectId;
  name: string;
  legalName?: string;
  industry: ClientIndustry;
  rcNumber?: string;
  website?: string;
  contact: { name: string; role?: string; phone: string; email: string };
  address: {
    line: string;
    zone?: Types.ObjectId;
    area?: string;
    landmark?: string;
    city: string;
    state: string;
  };
  billing: { email?: string; paymentTermsDays: number; creditLimit?: number };
  expectedMonthlyVolume?: MonthlyVolume;
  accountManager?: Types.ObjectId;
  notes?: string;
  status: ClientStatus;
  apiKeys: Types.DocumentArray<IApiKey>;
  webhook?: { url: string; events: WebhookEvent[]; isActive: boolean; secretCipher: string };
  /** Store-and-ship: we hold the client's stock at `office` and bill a handling fee per cycle. */
  warehousing?: {
    enabled: boolean;
    office: Types.ObjectId;
    lowStockThreshold: number;
    enabledAt?: Date;
    disabledAt?: Date;
    /** First activation. Handling-fee cycles run monthly from here and never move. */
    billingAnchor?: Date;
    /** Cycles ops made free in advance (1 = first cycle), inclusive. */
    freePeriods: Types.DocumentArray<IFreePeriod>;
  };
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<IApiKey>({
  name: { type: String, required: true },
  hash: { type: String, required: true },
  preview: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: Date,
  revokedAt: Date,
});

const clientSchema = new Schema<IClient>(
  {
    name: { type: String, required: true, trim: true },
    legalName: String,
    industry: { type: String, enum: CLIENT_INDUSTRIES, required: true, index: true },
    rcNumber: String,
    website: String,
    contact: {
      name: { type: String, required: true },
      role: String,
      phone: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
    },
    address: {
      line: { type: String, required: true },
      zone: { type: Schema.Types.ObjectId, ref: 'Zone' },
      area: String,
      landmark: String,
      city: { type: String, default: 'Abuja' },
      state: { type: String, default: 'FCT' },
    },
    billing: {
      email: String,
      paymentTermsDays: { type: Number, default: 0 },
      creditLimit: Number,
    },
    expectedMonthlyVolume: { type: String, enum: MONTHLY_VOLUMES },
    accountManager: { type: Schema.Types.ObjectId, ref: 'Admin' },
    notes: String,
    status: { type: String, enum: CLIENT_STATUSES, default: 'active', index: true },
    apiKeys: { type: [apiKeySchema], default: [] },
    webhook: {
      type: new Schema(
        {
          url: { type: String, required: true },
          events: [{ type: String, enum: WEBHOOK_EVENTS }],
          isActive: { type: Boolean, default: true },
          secretCipher: { type: String, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
    warehousing: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          office: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
          lowStockThreshold: { type: Number, default: 5 },
          enabledAt: Date,
          disabledAt: Date,
          billingAnchor: Date,
          freePeriods: {
            type: [
              new Schema<IFreePeriod>({
                fromCycle: { type: Number, required: true, min: 1 },
                toCycle: { type: Number, required: true, min: 1 },
                reason: { type: String, required: true },
                createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
                createdAt: { type: Date, default: Date.now },
              }),
            ],
            default: [],
          },
        },
        { _id: false },
      ),
      required: false,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

clientSchema.index(
  { 'apiKeys.hash': 1 },
  { unique: true, partialFilterExpression: { 'apiKeys.hash': { $type: 'string' } } },
);
clientSchema.index({ name: 1 });
clientSchema.index({ 'warehousing.enabled': 1 });

export const ClientModel = model<IClient>('Client', clientSchema);
