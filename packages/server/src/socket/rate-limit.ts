/**
 * Per-socket rate-limiting primitives. Each handler registration creates its
 * own instances, so the state lives and dies with the socket. Callers decide
 * what to do on a rejected event: gameplay floods are dropped silently (no
 * feedback for an abuser to tune against), while join/create attempts get an
 * error back so a legitimate UI can reset its "connecting..." state.
 */

/** Allows at most one event per `minIntervalMs`. */
export function createThrottle(minIntervalMs: number): () => boolean {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < minIntervalMs) return false;
    last = now;
    return true;
  };
}

/** Allows at most `maxPerWindow` events per fixed `windowMs` window. */
export function createRateLimiter(
  maxPerWindow: number,
  windowMs = 1000
): () => boolean {
  let windowStart = 0;
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= maxPerWindow;
  };
}
