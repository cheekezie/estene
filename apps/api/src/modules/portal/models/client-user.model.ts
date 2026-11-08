import { Schema, model, type Types } from 'mongoose';

/**
 * A person at a business client who signs in to the client portal. Staff
 * create the account with a temporary password; `mustChangePassword` stays
 * true until the user replaces it.
 */
export interface IClientUser {
  _id: Types.ObjectId;
  client: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const clientUserSchema = new Schema<IClientUser>(
  {
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // One login per email across all clients, so sign-in needs no client picker.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    mustChangePassword: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

export const ClientUserModel = model<IClientUser>('ClientUser', clientUserSchema);
