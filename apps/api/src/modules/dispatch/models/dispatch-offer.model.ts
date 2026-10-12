import { Schema, model, type Types } from 'mongoose';

/** A time-boxed job offer to one rider. Riders accept or decline; silence expires it. */
export interface IDispatchOffer {
  _id: Types.ObjectId;
  shipment: Types.ObjectId;
  rider: Types.ObjectId;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  /** Why this rider ranked where they did — makes dispatch decisions auditable. */
  rank: { tier: number; distanceKm: number; activeJobs: number };
  expiresAt: Date;
  respondedAt?: Date;
  createdAt: Date;
}

const dispatchOfferSchema = new Schema<IDispatchOffer>(
  {
    shipment: { type: Schema.Types.ObjectId, ref: 'Shipment', required: true },
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired', 'withdrawn'],
      default: 'pending',
    },
    rank: { tier: Number, distanceKm: Number, activeJobs: Number },
    expiresAt: { type: Date, required: true },
    respondedAt: Date,
  },
  { timestamps: true },
);

dispatchOfferSchema.index({ rider: 1, status: 1 });
dispatchOfferSchema.index({ shipment: 1, createdAt: -1 });
// At most one live offer per shipment at any time.
dispatchOfferSchema.index(
  { shipment: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'one_pending_offer_per_shipment',
  },
);

export const DispatchOfferModel = model<IDispatchOffer>('DispatchOffer', dispatchOfferSchema);
