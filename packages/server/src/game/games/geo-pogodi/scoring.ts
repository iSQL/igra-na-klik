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

/** Default decay, tuned for the bundled ~600 km map of Serbia. */
export const SERBIA_DECAY_KM = 220;

/**
 * Custom pack maps keep the same curve *relative to the map*: Serbia's
 * bbox diagonal is ~650 km with decay 220, so decay ≈ diagonal / 3. A city
 * map with a 30 km diagonal decays at ~10 km — a 5 km miss there stings
 * about as much as a 100 km miss does on the country map.
 */
export function decayKmForMapDiagonal(diagonalKm: number): number {
  if (!Number.isFinite(diagonalKm) || diagonalKm <= 0) return SERBIA_DECAY_KM;
  return Math.max(0.5, diagonalKm / 3);
}

export function pointsForDistanceKm(
  km: number,
  decayKm: number = SERBIA_DECAY_KM
): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  const raw = MAX_POINTS * Math.exp(-km / decayKm);
  return Math.max(0, Math.round(raw));
}
