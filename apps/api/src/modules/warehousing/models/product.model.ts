import { Schema, model, type Types } from 'mongoose';
import { PARCEL_SIZES, type ParcelSize } from '@estene/contracts/enums';

/** One item a warehousing client stores with us. SKUs are unique per client. */
export interface IProduct {
  _id: Types.ObjectId;
  client: Types.ObjectId;
  sku: string;
  name: string;
  barcode?: string;
  size: ParcelSize;
  weightKg: number;
  /** Kobo per unit. */
  declaredValue: number;
  fragile: boolean;
  imageUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    barcode: String,
    size: { type: String, enum: PARCEL_SIZES, default: 'small' },
    weightKg: { type: Number, required: true },
    declaredValue: { type: Number, default: 0, validate: Number.isInteger },
    fragile: { type: Boolean, default: false },
    imageUrl: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ client: 1, sku: 1 }, { unique: true });
productSchema.index({ client: 1, name: 1 });
productSchema.index({ barcode: 1 }, { partialFilterExpression: { barcode: { $type: 'string' } } });

export const ProductModel = model<IProduct>('Product', productSchema);
