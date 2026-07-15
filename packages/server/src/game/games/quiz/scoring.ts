/**
 * Scoring for the unified Kviz. Every question type caps at 1000 points per
 * round so mixed packs stay fair on the leaderboard:
 *  - choice (obicno/audio/video): speed-scored in the module —
 *    round(1000 * timeRemaining / timeLimit) for a correct answer.
 *  - geo: closeness only — exponential decay over km, scaled to the map.
 *  - broj: closeness × speed — exponential decay over the question's range.
 */

export const KVIZ_MAX_POINTS = 1000;

// --- geo -------------------------------------------------------------------

/** Default decay, tuned for the bundled ~600 km map of Serbia. */
export const SERBIA_DECAY_KM = 220;

/**
 * Custom question maps keep the same curve *relative to the map*: Serbia's
 * bbox diagonal is ~650 km with decay 220, so decay ≈ diagonal / 3. A city
 * map with a 30 km diagonal decays at ~10 km — a 5 km miss there stings
 * about as much as a 100 km miss does on the country map.
 */
export function decayKmForMapDiagonal(diagonalKm: number): number {
  if (!Number.isFinite(diagonalKm) || diagonalKm <= 0) return SERBIA_DECAY_KM;
  return Math.max(0.5, diagonalKm / 3);
}

/**
 *    points(km) = round( 1000 * exp(-km / decayKm) )
 *      0 km → 1000,  25 km → 893,  50 km → 797,  100 km → 635,
 *    200 km → 403,  400 km → 162,  600 km → 65   (Serbia decay)
 */
export function pointsForDistanceKm(
  km: number,
  decayKm: number = SERBIA_DECAY_KM
): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  const raw = KVIZ_MAX_POINTS * Math.exp(-km / decayKm);
  return Math.max(0, Math.round(raw));
}

// --- broj ------------------------------------------------------------------

// Decay constant, normalized to the question's range. The old year-only
// version used exp(-distance/20) over a fixed 125-year span (1900–2025);
// that is ≈ exp(-6.25 * distance/span), so K=6 preserves the original feel
// while making every question fair regardless of its min–max magnitude —
// the same idea as geo scaling its decay to the map size.
const K = 6;

// Speed floor: how much of the accuracy points you keep if you lock in your
// guess at the very last moment. Locking instantly keeps 100%; the bonus for
// speed is the (1 - SPEED_FLOOR) headroom on top, scaled by how much of the
// round's clock was still left. Coupling speed to accuracy (multiplicative,
// not additive) means a fast wild guess can't out-score a slow bullseye.
export const SPEED_FLOOR = 0.5;

/**
 * Accuracy-only points for a numeric guess. Exact = 1000 (bullseye), then an
 * exponential falloff scaled to the question's range (`span = max - min`) so a
 * near miss still pays well but wild misses earn little.
 */
export function pointsForDistance(distance: number, span: number): number {
  if (distance <= 0) return KVIZ_MAX_POINTS;
  const s = Math.max(1, span);
  return Math.round(KVIZ_MAX_POINTS * Math.exp((-K * distance) / s));
}

/**
 * Final points for a broj guess: accuracy scaled by a speed factor.
 * `speedFraction` is the share of the answering clock still remaining when
 * the guess was locked (1 = instant, 0 = buzzer). The factor ranges from
 * SPEED_FLOOR (slowest) to 1.0 (instant) — accuracy always dominates.
 */
export function pointsForGuess(
  distance: number,
  span: number,
  speedFraction: number
): number {
  const accuracy = pointsForDistance(distance, span);
  const frac = Math.max(0, Math.min(1, speedFraction));
  const factor = SPEED_FLOOR + (1 - SPEED_FLOOR) * frac;
  return Math.round(accuracy * factor);
}

/** Snap a raw guess to the question's range and step. */
export function normalizeGuess(
  raw: number,
  question: { min: number; max: number; step?: number }
): number {
  const clamped = Math.max(question.min, Math.min(question.max, raw));
  const step = question.step && question.step > 0 ? question.step : 1;
  const snapped =
    question.min + Math.round((clamped - question.min) / step) * step;
  return Math.max(question.min, Math.min(question.max, snapped));
}
