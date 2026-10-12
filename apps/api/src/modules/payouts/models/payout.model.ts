import { Schema, model, type Types } from 'mongoose';
import {
  PAYOUT_METHODS,
  PAYOUT_STATUSES,
  type PayoutMethod,
  type PayoutStatus,
} from '@estene/contracts/payout';

/** Money out to a partner rider. Ledger `payout` entries are posted only on success. */
export interface IPayout {
  _id: Types.ObjectId;
  reference: string;
  rider: Types.ObjectId;
  amount: number;
  method: PayoutMethod;
  status: PayoutStatus;
  /** Snapshot at send time — later changes to the rider's account don't rewrite history. */
  bankAccount?: { bankCode: string; bankName: string; accountNumber: string; accountName: string };
  providerReference?: string;
  failureReason?: string;
  note?: string;
  initiatedBy?: Types.ObjectId;
  attempts: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const payoutSchema = new Schema<IPayout>(
  {
    reference: { type: String, required: true, unique: true },
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', required: true, index: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    method: { type: String, enum: PAYOUT_METHODS, required: true },
    status: { type: String, enum: PAYOUT_STATUSES, default: 'pending', index: true },
    bankAccount: { bankCode: String, bankName: String, accountNumber: String, accountName: String },
    providerReference: String,
    failureReason: String,
    note: String,
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    attempts: { type: Number, default: 0 },
    completedAt: Date,
  },
  { timestamps: true },
);

payoutSchema.index({ createdAt: -1 });

export const PayoutModel = model<IPayout>('Payout', payoutSchema);
