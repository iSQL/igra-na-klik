type HapticPattern = number | readonly number[];

const patterns = {
  tap: [50],
  // Dva ravnopravna udarca — pad teritorije u duelu (kratak `tap` je odbrana).
  double: [90, 70, 90],
  success: [50, 50, 100],
  error: [100, 50, 100, 50, 100],
} as const;

function vibrate(pattern: HapticPattern): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern as VibratePattern);
  }
}

export const haptics = {
  tap: () => vibrate(patterns.tap),
  double: () => vibrate(patterns.double),
  success: () => vibrate(patterns.success),
  error: () => vibrate(patterns.error),
};
