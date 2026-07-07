export const MAX_YEAR_POINTS = 1000;

/**
 * Distance-based scoring for a year guess. Exact = 1000 (bullseye), then an
 * exponential falloff so being a few years off still pays well but wild
 * misses earn little. Mirrors the distance-scoring idea from Pogodi gde je,
 * collapsed to one dimension (years instead of kilometres).
 */
export function pointsForYearDistance(distance: number): number {
  if (distance <= 0) return MAX_YEAR_POINTS;
  return Math.round(MAX_YEAR_POINTS * Math.exp(-distance / 20));
}
