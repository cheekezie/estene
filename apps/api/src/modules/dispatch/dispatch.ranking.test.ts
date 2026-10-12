import { describe, expect, it } from 'vitest';
import { rankCandidates } from './dispatch.ranking';

const zone = 'zoneA';
const rider = (riderId: string, primaryZone: string, distanceKm: number, activeJobs = 0, coverageZones: string[] = []) => ({
  riderId, primaryZone, coverageZones, distanceKm, activeJobs,
});

describe('rankCandidates', () => {
  it('prefers primary-zone riders even when a passer-by is closer', () => {
    const ranked = rankCandidates([rider('passer', 'zoneB', 0.2), rider('home', zone, 2.5)], zone, 3);
    expect(ranked.map((r) => r.riderId)).toEqual(['home', 'passer']);
  });

  it('ranks coverage-zone riders between primary and passers-by', () => {
    const ranked = rankCandidates([rider('passer', 'zoneB', 0.1), rider('cover', 'zoneC', 3, 0, [zone]), rider('home', zone, 4)], zone, 3);
    expect(ranked.map((r) => r.tier)).toEqual([0, 1, 2]);
  });

  it('within a tier, balances load before distance', () => {
    const ranked = rankCandidates([rider('busy', zone, 0.5, 2), rider('free', zone, 3, 0)], zone, 3);
    expect(ranked[0]?.riderId).toBe('free');
  });

  it('skips riders at their job cap', () => {
    expect(rankCandidates([rider('full', zone, 0.1, 3)], zone, 3)).toEqual([]);
  });
});
