import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { PAYMENT_METHODS, type PaymentMethod } from '@estene/contracts/enums';
import {
  PAYMENT_CHANNELS,
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
  TRANSACTION_STATUSES,
  type PaymentChannel,
  type PaymentProvider,
  type PaymentPurpose,
  type TransactionStatus,
} from '@estene/contracts/payment';

/**
 * One row per attempt to move money *in*: gateway checkouts, account-number
 * transfers, cash handed to riders and payments staff record by hand. The
 * shipment's amountPaid / paymentStatus are always derived from these rows.
 */
export interface IPayment {
  _id: Types.ObjectId;
  reference: string;
  shipment: Types.ObjectId;
  client?: Types.ObjectId | null;
  purpose: PaymentPurpose;
  channel: PaymentChannel;
  method: PaymentMethod;
  provider: PaymentProvider;
  amount: number;
  status: TransactionStatus;
  customer: { name: string; phone: string; email?: string };
  providerReference?: string;
  responseCode?: string;
  responseDescription?: string;
  checkoutUrl?: string;
  virtualAccount?: {
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt: Date;
  };
  collectedBy?: Types.ObjectId;
  recordedBy?: Types.ObjectId;
  note?: string;
  events: { type: string; at: Date; note?: string }[];
  paidAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    reference: { type: String, required: true, unique: true },
    shipment: { type: Schema.Types.ObjectId, ref: 'Shipment', required: true, index: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
    channel: { type: String, enum: PAYMENT_CHANNELS, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    status: { type: String, enum: TRANSACTION_STATUSES, default: 'pending' },
    customer: { name: String, phone: String, email: String },
    providerReference: String,
    responseCode: String,
    responseDescription: String,
    checkoutUrl: String,
    virtualAccount: {
      accountNumber: String,
      bankName: String,
      accountName: String,
      expiresAt: Date,
    },
    collectedBy: { type: Schema.Types.ObjectId, ref: 'Rider' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    note: String,
    events: [
      { _id: false, type: { type: String }, at: { type: Date, default: Date.now }, note: String },
    ],
    paidAt: Date,
    expiresAt: Date,
  },
  { timestamps: true },
);

paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ channel: 1, createdAt: -1 });
paymentSchema.index({ createdAt: -1 });

export const PaymentModel = model<IPayment>('Payment', paymentSchema);
export type PaymentDoc = HydratedDocument<IPayment>;
