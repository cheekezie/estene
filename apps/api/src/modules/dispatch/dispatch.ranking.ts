import type { Types } from 'mongoose';

export type Candidate = {
  riderId: string;
  primaryZone: Types.ObjectId | string;
  coverageZones: (Types.ObjectId | string)[];
  distanceKm: number;
  activeJobs: number;
};

export type RankedCandidate = Candidate & { tier: 0 | 1 | 2 };

/**
 * Who gets offered the job first. Only riders who are online *and*
 * physically near the pickup are candidates at all; among them:
 *
 *   tier 0 — the pickup zone is their primary zone
 *   tier 1 — the pickup zone is one of their coverage zones
 *   tier 2 — just passing through
 *
 * Within a tier, the rider carrying fewer jobs wins, then the nearer one.
 * Riders at their job cap are skipped.
 */
export function rankCandidates(
  candidates: Candidate[],
  pickupZoneId: string,
  maxActiveJobs: number,
): RankedCandidate[] {
  return candidates
    .filter((c) => c.activeJobs < maxActiveJobs)
    .map((c) => {
      const tier: RankedCandidate['tier'] =
        String(c.primaryZone) === pickupZoneId
          ? 0
          : c.coverageZones.some((z) => String(z) === pickupZoneId)
            ? 1
            : 2;
      return { ...c, tier };
    })
    .sort((a, b) => a.tier - b.tier || a.activeJobs - b.activeJobs || a.distanceKm - b.distanceKm);
}
