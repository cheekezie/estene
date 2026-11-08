import { Schema, model, type Types } from 'mongoose';
import { VEHICLE_TYPES, type VehicleType } from '@estene/contracts/enums';
import {
  APPLICANT_KINDS,
  RIDER_APPLICATION_STATUSES,
  RIDER_DOCUMENT_TYPES,
  type ApplicantKind,
  type RiderApplicationStatus,
  type RiderDocumentType,
} from '@estene/contracts/rider-application';

export interface IRiderDocument {
  _id: Types.ObjectId;
  type: RiderDocumentType;
  /** Object key in the private R2 documents bucket. Never sent to clients. */
  key: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy?: Types.ObjectId;
  uploadedByName?: string;
  uploadedAt: Date;
}

export interface IRiderApplication {
  _id: Types.ObjectId;
  /** Quoted to the applicant, e.g. "AP-7K3M9Q". */
  reference: string;
  status: RiderApplicationStatus;
  kind: ApplicantKind;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  area: string;
  preferredZone?: Types.ObjectId;
  vehicleType: VehicleType;
  ownsVehicle: boolean;
  plateNumber?: string;
  yearsRiding: number;
  fleetName?: string;
  fleetSize?: number;
  notes?: string;
  vetting?: { at?: Date; office?: Types.ObjectId };
  documents: IRiderDocument[];
  /** Who did what, newest last. */
  timeline: { at: Date; by?: Types.ObjectId; byName?: string; text: string }[];
  rejectionReason?: string;
  rider?: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<IRiderApplication>(
  {
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: RIDER_APPLICATION_STATUSES, default: 'submitted', index: true },
    kind: { type: String, enum: APPLICANT_KINDS, required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    area: { type: String, required: true },
    preferredZone: { type: Schema.Types.ObjectId, ref: 'Zone' },
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    ownsVehicle: { type: Boolean, required: true },
    plateNumber: String,
    yearsRiding: { type: Number, required: true },
    fleetName: String,
    fleetSize: Number,
    notes: String,
    vetting: {
      at: Date,
      office: { type: Schema.Types.ObjectId, ref: 'Office' },
    },
    documents: [
      {
        type: { type: String, enum: RIDER_DOCUMENT_TYPES, required: true },
        key: { type: String, required: true },
        fileName: { type: String, required: true },
        contentType: { type: String, required: true },
        size: { type: Number, required: true },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
        uploadedByName: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    timeline: [
      {
        _id: false,
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: 'Admin' },
        byName: String,
        text: { type: String, required: true },
      },
    ],
    rejectionReason: String,
    rider: { type: Schema.Types.ObjectId, ref: 'Rider' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);
applicationSchema.index({ status: 1, createdAt: -1 });

export const RiderApplicationModel = model<IRiderApplication>(
  'RiderApplication',
  applicationSchema,
);
