import { Schema, model, type Types } from 'mongoose';

export interface INotificationLog {
  _id: Types.ObjectId;
  channel: 'sms' | 'email' | 'whatsapp' | 'push';
  to: string;
  template: string;
  shipment?: Types.ObjectId;
  status: 'sent' | 'failed';
  provider: string;
  error?: string;
  createdAt: Date;
}

const notificationLogSchema = new Schema<INotificationLog>(
  {
    channel: { type: String, required: true },
    to: { type: String, required: true },
    template: { type: String, required: true },
    shipment: { type: Schema.Types.ObjectId, ref: 'Shipment', index: true },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    provider: { type: String, required: true },
    error: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Message bodies are deliberately not stored — they can contain delivery PINs.
notificationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const NotificationLogModel = model<INotificationLog>(
  'NotificationLog',
  notificationLogSchema,
);
