import { Schema, model, type Types } from 'mongoose';
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '@estene/contracts/warehouse';

/**
 * Append-only history of on-hand changes, like the money ledger. Automatic
 * movements carry a deterministic idempotency key so a retry can't double-count.
 */
export interface IStockMovement {
  _id: Types.ObjectId;
  client: Types.ObjectId;
  product: Types.ObjectId;
  office: Types.ObjectId;
  type: StockMovementType;
  /** Signed change to on-hand. */
  qty: number;
  onHandAfter: number;
  inbound?: Types.ObjectId;
  order?: Types.ObjectId;
  note?: string;
  actorType: 'admin' | 'client' | 'system';
  actorId?: Types.ObjectId;
  idempotencyKey: string;
  createdAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>(
  {
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    office: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    type: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true },
    qty: { type: Number, required: true, validate: Number.isInteger },
    onHandAfter: { type: Number, required: true },
    inbound: { type: Schema.Types.ObjectId, ref: 'Inbound' },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    note: String,
    actorType: { type: String, enum: ['admin', 'client', 'system'], required: true },
    actorId: Schema.Types.ObjectId,
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

stockMovementSchema.index({ client: 1, createdAt: -1 });
stockMovementSchema.index({ product: 1, createdAt: -1 });

export const StockMovementModel = model<IStockMovement>('StockMovement', stockMovementSchema);
