/**
 * Haptic feedback utilities — best-effort vibration on supported devices.
 * All calls are safe to use on desktop (silently no-op).
 */

/** Short tap vibration (10ms). */
export function haptic(pattern: number | number[] = 10): void {
  try {
    navigator?.vibrate?.(pattern);
  } catch { /* vibration is best-effort */ }
}

/** Medium pulse for significant actions (e.g. swipe threshold crossed). */
export function hapticMedium(): void {
  haptic([15, 30, 15]);
}
