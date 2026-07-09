export const MAX_POINTS = 1000;

// Decay constant, normalized to the question's range. The old year-only
// version used exp(-distance/20) over a fixed 125-year span (1900–2025);
// that is ≈ exp(-6.25 * distance/span), so K=6 preserves the original feel
// while making every question fair regardless of its min–max magnitude —
// the same idea as Pogodi gde je scaling its decay to the map size.
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
  if (distance <= 0) return MAX_POINTS;
  const s = Math.max(1, span);
  return Math.round(MAX_POINTS * Math.exp((-K * distance) / s));
}

/**
 * Final points for a guess: accuracy scaled by a speed factor. `speedFraction`
 * is the share of the guessing clock still remaining when the guess was locked
 * (1 = instant, 0 = buzzer). The factor ranges from SPEED_FLOOR (slowest) to
 * 1.0 (instant), so a perfect guess is worth 600–1000 by speed while a poor
 * guess stays low no matter how fast — accuracy always dominates.
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
