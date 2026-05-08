import { useEffect } from 'react';

type WakeLockSentinel = {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinel>;
  };
};

/**
 * Holds a screen Wake Lock for the lifetime of the component that calls
 * this hook. Prevents the phone from sleeping mid-round, which is the
 * single biggest cause of mid-game disconnects on mobile (suspended tabs
 * drop the WebSocket).
 *
 * The browser auto-releases the lock whenever the page becomes hidden,
 * so we re-acquire it on `visibilitychange`. Unsupported browsers and
 * permission-denied errors are silently ignored — losing the lock just
 * means the existing reconnect flow does its job instead.
 */
export function useWakeLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      try {
        sentinel = await nav.wakeLock!.request('screen');
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        // Permission denied or unsupported — fall back to reconnect flow.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) {
        void sentinel.release();
        sentinel = null;
      }
    };
  }, [active]);
}
