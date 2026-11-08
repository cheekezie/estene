import { Schema, model, type Types } from 'mongoose';
import { INBOUND_STATUSES, type InboundStatus } from '@estene/contracts/warehouse';

/** Goods a client is sending into the warehouse, and what we counted when they arrived. */
export interface IInbound {
  _id: Types.ObjectId;
  client: Types.ObjectId;
  office: Types.ObjectId;
  /** Set when the goods are moving here from another Estene warehouse. */
  transferFrom?: Types.ObjectId | null;
  number: string;
  reference?: string;
  status: InboundStatus;
  lines: {
    product: Types.ObjectId;
    expectedQty: number;
    receivedQty: number;
    damagedQty: number;
  }[];
  expectedAt?: Date;
  receivedAt?: Date;
  receivedBy?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const inboundSchema = new Schema<IInbound>(
  {
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    office: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    transferFrom: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    number: { type: String, required: true, unique: true },
    reference: String,
    status: { type: String, enum: INBOUND_STATUSES, default: 'expected' },
    lines: [
      {
        _id: false,
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        expectedQty: { type: Number, required: true },
        receivedQty: { type: Number, default: 0 },
        damagedQty: { type: Number, default: 0 },
      },
    ],
    expectedAt: Date,
    receivedAt: Date,
    receivedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    notes: String,
  },
  { timestamps: true },
);

inboundSchema.index(
  { client: 1, reference: 1 },
  { unique: true, partialFilterExpression: { reference: { $type: 'string' } } },
);
inboundSchema.index({ office: 1, status: 1, createdAt: -1 });

export const InboundModel = model<IInbound>('Inbound', inboundSchema);
