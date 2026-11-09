import { Schema, model, type Types } from 'mongoose';
import { HANDLING_FEE_STATUSES, type HandlingFeeStatus } from '@estene/contracts/handling-fee';

/**
 * One closed billing cycle for one warehousing client. Created once by the
 * daily billing job (unique per client and cycle start); the units and price
 * are frozen at billing time, so later config changes never rewrite history.
 * The money itself lives in the ledger (`handling_fee`, `fee_waived`,
 * `payment_received`); this row is the invoice the client sees and pays.
 */
export interface IHandlingFee {
  _id: Types.ObjectId;
  reference: string;
  client: Types.ObjectId;
  cycle: number;
  periodStart: Date;
  periodEnd: Date;
  units: { carriedIn: number; added: number; billed: number };
  unitsPerBlock: number;
  pricePerBlock: number;
  blocks: number;
  /** What is charged: 0 when free or no stock. */
  amount: number;
  /** The price before any free period or waiver. */
  listAmount: number;
  status: HandlingFeeStatus;
  dueAt?: Date;
  freeReason?: string;
  waived?: { at: Date; by: Types.ObjectId; reason: string };
  paidAt?: Date;
  payment?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const handlingFeeSchema = new Schema<IHandlingFee>(
  {
    reference: { type: String, required: true, unique: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    cycle: { type: Number, required: true, min: 1 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    units: {
      carriedIn: { type: Number, required: true },
      added: { type: Number, required: true },
      billed: { type: Number, required: true },
    },
    unitsPerBlock: { type: Number, required: true },
    pricePerBlock: { type: Number, required: true },
    blocks: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    listAmount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    status: { type: String, enum: HANDLING_FEE_STATUSES, required: true },
    dueAt: Date,
    freeReason: String,
    waived: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          by: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
          reason: { type: String, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
    paidAt: Date,
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
  },
  { timestamps: true },
);

handlingFeeSchema.index({ client: 1, periodStart: 1 }, { unique: true });
handlingFeeSchema.index({ client: 1, cycle: -1 });
handlingFeeSchema.index({ status: 1, dueAt: 1 });

export const HandlingFeeModel = model<IHandlingFee>('HandlingFee', handlingFeeSchema);
