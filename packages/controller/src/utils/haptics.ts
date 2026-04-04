type HapticPattern = number | readonly number[];

const patterns = {
  tap: [50],
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
  success: () => vibrate(patterns.success),
  error: () => vibrate(patterns.error),
};
