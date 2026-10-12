import { Schema, model, type Types } from 'mongoose';
import {
  RIDER_STATUSES,
  RIDER_TYPES,
  VEHICLE_TYPES,
  type RiderStatus,
  type RiderType,
  type VehicleType,
} from '@estene/contracts/enums';

export interface IRider {
  _id: Types.ObjectId;
  /** Human-friendly id printed on rider ID cards, e.g. "RD-7K3M9Q". */
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  passwordHash: string;
  type: RiderType;
  status: RiderStatus;
  vehicleType: VehicleType;
  plateNumber?: string;
  primaryZone: Types.ObjectId;
  coverageZones: Types.ObjectId[];
  commissionPct?: number;
  fleetName?: string;
  onboardedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const riderSchema = new Schema<IRider>(
  {
    code: { type: String, required: true, unique: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    type: { type: String, enum: RIDER_TYPES, required: true, index: true },
    status: { type: String, enum: RIDER_STATUSES, default: 'pending', index: true },
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    plateNumber: String,
    primaryZone: { type: Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
    coverageZones: [{ type: Schema.Types.ObjectId, ref: 'Zone', index: true }],
    commissionPct: Number,
    fleetName: String,
    onboardedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

export const RiderModel = model<IRider>('Rider', riderSchema);
