import { Schema, model, type Types } from 'mongoose';

/** A time-boxed job offer to one rider. Riders accept or decline; silence expires it. */
export interface IDispatchOffer {
  _id: Types.ObjectId;
  order: Types.ObjectId;
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
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'expired', 'withdrawn'], default: 'pending' },
    rank: { tier: Number, distanceKm: Number, activeJobs: Number },
    expiresAt: { type: Date, required: true },
    respondedAt: Date,
  },
  { timestamps: true },
);

dispatchOfferSchema.index({ rider: 1, status: 1 });
dispatchOfferSchema.index({ order: 1, createdAt: -1 });
// At most one live offer per order at any time.
dispatchOfferSchema.index({ order: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_offer_per_order' });

export const DispatchOfferModel = model<IDispatchOffer>('DispatchOffer', dispatchOfferSchema);
