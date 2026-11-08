import { Schema, model, type Types } from 'mongoose';

/**
 * How many units of one product sit in one warehouse. `reserved` units belong
 * to orders not yet packed; available = onHand − reserved. Change it only
 * through StockService, which uses conditional `$inc` so stock never goes negative.
 */
export interface IStockLevel {
  _id: Types.ObjectId;
  client: Types.ObjectId;
  product: Types.ObjectId;
  office: Types.ObjectId;
  onHand: number;
  reserved: number;
  bin?: string | null;
  /** Set when the client was told this product is low; cleared once it is restocked above the threshold. */
  lowAlertedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const stockLevelSchema = new Schema<IStockLevel>(
  {
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    office: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    onHand: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    bin: { type: String, default: null },
    lowAlertedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

stockLevelSchema.index({ product: 1, office: 1 }, { unique: true });
stockLevelSchema.index({ client: 1, office: 1 });

export const StockLevelModel = model<IStockLevel>('StockLevel', stockLevelSchema);
