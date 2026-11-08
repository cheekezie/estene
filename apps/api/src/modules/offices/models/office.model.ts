import { Schema, model, type Types } from 'mongoose';

/** An Estene branch. City/state come from its zone. */
export interface IOffice {
  _id: Types.ObjectId;
  name: string;
  code: string;
  zone: Types.ObjectId;
  area: string;
  address: string;
  landmark?: string;
  phone: string;
  openingHours: string;
  location?: { type: 'Point'; coordinates: [number, number] };
  isActive: boolean;
  /** Holds business clients' stock (warehousing). */
  isWarehouse: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const officeSchema = new Schema<IOffice>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    zone: { type: Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
    area: { type: String, required: true },
    address: { type: String, required: true },
    landmark: String,
    phone: { type: String, required: true },
    openingHours: { type: String, default: 'Mon–Sat, 8am–6pm' },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined },
    },
    isActive: { type: Boolean, default: true, index: true },
    isWarehouse: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const OfficeModel = model<IOffice>('Office', officeSchema);
