/**
 * Distance → points mapping for the geo-pogodi game.
 *
 * Tuning: Serbia's longest dimension is ~600 km. We use exponential decay
 * so near-perfect pins are richly rewarded without making mid-range mistakes
 * (100 → 200 km) feel like a cliff.
 *
 *    points(km) = round( 5000 * exp(-km / 220) )
 *
 *      0 km → 5000
 *      1 km → 4977
 *      5 km → 4889
 *     25 km → 4467
 *     50 km → 3990
 *    100 km → 3185
 *    200 km → 2030
 *    400 km →  824
 *    600 km →  339
 */

const MAX_POINTS = 5000;
const DECAY_KM = 220;

export function pointsForDistanceKm(km: number): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  const raw = MAX_POINTS * Math.exp(-km / DECAY_KM);
  return Math.max(0, Math.round(raw));
}
