import { Schema, model, type Types } from 'mongoose';
import {
  CARRIER_TYPES,
  MANIFEST_STATUSES,
  type CarrierType,
  type ManifestStatus,
} from '@estene/contracts/enums';

/** A batch of parcels travelling between two offices (line-haul). */
export interface IManifest {
  _id: Types.ObjectId;
  code: string;
  status: ManifestStatus;
  fromOffice: Types.ObjectId;
  toOffice: Types.ObjectId;
  carrier: {
    type: CarrierType;
    vehiclePlate?: string;
    driverName?: string;
    driverPhone?: string;
    carrierName?: string;
    waybillNumber?: string;
  };
  note?: string;
  shipments: { shipment: Types.ObjectId; addedAt: Date; receivedAt?: Date }[];
  createdBy?: Types.ObjectId;
  departedAt?: Date;
  arrivedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const manifestSchema = new Schema<IManifest>(
  {
    code: { type: String, required: true, unique: true },
    status: { type: String, enum: MANIFEST_STATUSES, default: 'open', index: true },
    fromOffice: { type: Schema.Types.ObjectId, ref: 'Office', required: true, index: true },
    toOffice: { type: Schema.Types.ObjectId, ref: 'Office', required: true, index: true },
    carrier: {
      type: { type: String, enum: CARRIER_TYPES, required: true },
      vehiclePlate: String,
      driverName: String,
      driverPhone: String,
      carrierName: String,
      waybillNumber: String,
    },
    note: String,
    shipments: [
      {
        _id: false,
        shipment: { type: Schema.Types.ObjectId, ref: 'Shipment', required: true },
        addedAt: { type: Date, default: Date.now },
        receivedAt: Date,
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    departedAt: Date,
    arrivedAt: Date,
    closedAt: Date,
  },
  { timestamps: true },
);

manifestSchema.index({ 'shipments.shipment': 1 });
manifestSchema.index({ createdAt: -1 });

export const ManifestModel = model<IManifest>('Manifest', manifestSchema);
