import { Schema, model, type Types } from 'mongoose';

/**
 * Pre-printed QR tags. Ops prints them in batches; a rider scans one at
 * pickup to bind it to an shipment, and rescans it at delivery. Only codes that
 * exist here can be bound, so a mistyped or photocopied tag is rejected.
 */
export interface IParcelTag {
  _id: Types.ObjectId;
  code: string;
  batch: string;
  status: 'available' | 'bound' | 'void';
  shipment?: Types.ObjectId;
  boundAt?: Date;
  createdAt: Date;
}

const parcelTagSchema = new Schema<IParcelTag>(
  {
    code: { type: String, required: true, unique: true },
    batch: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['available', 'bound', 'void'],
      default: 'available',
      index: true,
    },
    shipment: { type: Schema.Types.ObjectId, ref: 'Shipment' },
    boundAt: Date,
  },
  { timestamps: true },
);

export const ParcelTagModel = model<IParcelTag>('ParcelTag', parcelTagSchema);
