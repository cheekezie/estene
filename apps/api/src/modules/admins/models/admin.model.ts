import { Schema, model, type Types } from 'mongoose';
import { ADMIN_ROLES, type AdminRole } from '@estene/contracts/enums';

export interface IAdmin {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  /** Office agents work at one office. */
  office?: Types.ObjectId | null;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, required: true },
    office: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export const AdminModel = model<IAdmin>('Admin', adminSchema);
