import { Schema, model, type Types } from 'mongoose';
import { LEDGER_ENTRY_TYPES, type LedgerEntryType } from '@estene/contracts/enums';

/**
 * Append-only money ledger. Entries are never edited or deleted — corrections
 * are new `adjustment` entries. Every automatic entry carries an idempotency
 * key, so a replayed event can never double-post.
 */
export interface ILedgerEntry {
  _id: Types.ObjectId;
  type: LedgerEntryType;
  /** Always positive kobo; `type` gives the direction. */
  amount: number;
  account: 'platform' | 'rider' | 'customer';
  rider?: Types.ObjectId;
  shipment?: Types.ObjectId;
  /** Business client billed for this entry (on-account shipments). */
  client?: Types.ObjectId;
  idempotencyKey: string;
  reference?: string;
  note?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

const ledgerEntrySchema = new Schema<ILedgerEntry>(
  {
    type: { type: String, enum: LEDGER_ENTRY_TYPES, required: true },
    amount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    account: { type: String, enum: ['platform', 'rider', 'customer'], required: true },
    rider: { type: Schema.Types.ObjectId, ref: 'Rider' },
    shipment: { type: Schema.Types.ObjectId, ref: 'Shipment', index: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client' },
    idempotencyKey: { type: String, required: true, unique: true },
    reference: String,
    note: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ledgerEntrySchema.index({ rider: 1, createdAt: -1 });
ledgerEntrySchema.index({ type: 1, createdAt: -1 });
ledgerEntrySchema.index({ client: 1, type: 1 });

export const LedgerEntryModel = model<ILedgerEntry>('LedgerEntry', ledgerEntrySchema);
