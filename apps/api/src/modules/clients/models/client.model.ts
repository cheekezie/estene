import { Schema, model, type Types } from 'mongoose';
import {
  CLIENT_STATUSES,
  WEBHOOK_EVENTS,
  type ClientStatus,
  type WebhookEvent,
} from '@estene/contracts/enums';

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

export interface IClient {
  _id: Types.ObjectId;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  notes?: string;
  status: ClientStatus;
  apiKeys: Types.DocumentArray<IApiKey>;
  webhook?: { url: string; events: WebhookEvent[]; isActive: boolean; secretCipher: string };
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
    contactName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
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
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

clientSchema.index(
  { 'apiKeys.hash': 1 },
  { unique: true, partialFilterExpression: { 'apiKeys.hash': { $type: 'string' } } },
);
clientSchema.index({ name: 1 });

export const ClientModel = model<IClient>('Client', clientSchema);
