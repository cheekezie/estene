import { Schema, model, type Types } from 'mongoose';

/** Zone-to-zone fare. Stored once per unordered pair (zoneA < zoneB) — A→B costs the same as B→A. */
export interface IRouteRate {
  _id: Types.ObjectId;
  zoneA: Types.ObjectId;
  zoneB: Types.ObjectId;
  fare: number;
}

const routeRateSchema = new Schema<IRouteRate>(
  {
    zoneA: { type: Schema.Types.ObjectId, ref: 'Zone', required: true },
    zoneB: { type: Schema.Types.ObjectId, ref: 'Zone', required: true },
    fare: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

routeRateSchema.index({ zoneA: 1, zoneB: 1 }, { unique: true });

export const RouteRateModel = model<IRouteRate>('RouteRate', routeRateSchema);

export const orderedPair = (a: string, b: string) =>
  a < b ? { zoneA: a, zoneB: b } : { zoneA: b, zoneB: a };
