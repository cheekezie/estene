import { Schema, model, type Types } from 'mongoose';

/**
 * One row per event sent to one client. The exact JSON body is stored so a
 * resend is byte-identical (and re-signed). Rows expire after 30 days — the
 * payload contains customer contact details.
 */
export interface IWebhookDelivery {
  _id: Types.ObjectId;
  client: Types.ObjectId;
  eventId: string;
  type: string;
  order?: Types.ObjectId;
  trackingNumber?: string;
  url: string;
  body: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastStatusCode?: number;
  lastError?: string;
  deliveredAt?: Date;
  createdAt: Date;
}

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    trackingNumber: String,
    url: { type: String, required: true },
    body: { type: String, required: true },
    status: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lastStatusCode: Number,
    lastError: String,
    deliveredAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

webhookDeliverySchema.index({ client: 1, createdAt: -1 });
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const WebhookDeliveryModel = model<IWebhookDelivery>(
  'WebhookDelivery',
  webhookDeliverySchema,
);
