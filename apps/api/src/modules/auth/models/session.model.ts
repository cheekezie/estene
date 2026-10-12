import { Schema, model, type Types } from 'mongoose';
import { ACTOR_TYPES, type ActorType } from '@estene/contracts/enums';

/**
 * One row per refresh token. Only the SHA-256 of the token is stored, and
 * each refresh rotates it — a stolen, already-used token is detected and the
 * whole session family is revoked.
 */
export interface ISession {
  _id: Types.ObjectId;
  actor: ActorType;
  subject: Types.ObjectId;
  tokenHash: string;
  family: string;
  revokedAt?: Date;
  replacedBy?: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    actor: { type: String, enum: ACTOR_TYPES, required: true },
    subject: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    revokedAt: Date,
    replacedBy: String,
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mongo deletes expired sessions on its own.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model<ISession>('Session', sessionSchema);
