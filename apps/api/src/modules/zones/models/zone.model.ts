import { Schema, model, type Types } from 'mongoose';

export interface IZone {
  _id: Types.ObjectId;
  name: string;
  code: string;
  city: string;
  state: string;
  areas: string[];
  /** GeoJSON point — [lng, lat] shipment, as Mongo requires. */
  center: { type: 'Point'; coordinates: [number, number] };
  radiusKm: number;
  intraZoneFare: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const zoneSchema = new Schema<IZone>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    city: { type: String, required: true, default: 'Abuja' },
    state: { type: String, required: true, default: 'FCT', index: true },
    areas: { type: [String], default: [] },
    center: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    radiusKm: { type: Number, required: true },
    intraZoneFare: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

zoneSchema.index({ center: '2dsphere' });

export const ZoneModel = model<IZone>('Zone', zoneSchema);
