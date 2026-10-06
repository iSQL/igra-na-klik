import { useEffect, useRef, useState } from 'react';

/**
 * "Sigurno? Tapni opet" — a risky button asks for a second tap within `ms`
 * instead of opening a dialog. `tap(key, run)` arms on the first tap and runs
 * on the second; `armed` is the key currently waiting (null = none), so one
 * hook can serve a row of buttons.
 */
export function useTwoTap(ms = 2000): {
  armed: string | null;
  tap: (key: string, run: () => void) => void;
} {
  const [armed, setArmed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const tap = (key: string, run: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    if (armed === key) {
      setArmed(null);
      run();
      return;
    }
    setArmed(key);
    timer.current = setTimeout(() => setArmed(null), ms);
  };
  return { armed, tap };
}
