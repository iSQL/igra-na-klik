import { useEffect, useState } from 'react';
import { leaveRoom } from '../leaveRoom';
import { usePlayerStore } from '../store/playerStore';
import { LeaveRoomDialog } from './LeaveRoomDialog';

/**
 * Maps the phone's hardware/browser Back button to the "Napusti sobu" flow.
 *
 * The controller is a single-page app that switches screens through a Zustand
 * store, not the History API — so without this, a Back press just pops the
 * real history stack and drops the player out of the controller (e.g.
 * ...→ /play/ → / landing) instead of leaving the room.
 *
 * While the player is in a room we keep exactly ONE tagged trap entry on top
 * of the history stack. Every Back press pops it, which fires `popstate`; we
 * re-push an identical entry (so the room stays trapped for the next press)
 * and open the leave-room confirmation instead of navigating away. Because we
 * always restore exactly one trap entry, the net history depth never changes
 * and the browser can never walk down to `/play/` / `/` on its own.
 */
export function BackButtonGuard() {
  const inRoom = usePlayerStore((s) => !!s.player);
  const [confirming, setConfirming] = useState(false);

  // Single popstate listener, mounted once. Reads the store live so it never
  // acts on a stale `inRoom` (StrictMode / re-render safe).
  useEffect(() => {
    const onPop = () => {
      // Not in a room → let the browser navigate normally.
      if (!usePlayerStore.getState().player) return;
      // Re-arm the trap and ask to leave instead of leaving the app.
      window.history.pushState({ igra: 'room' }, '');
      setConfirming(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Seed the single trap entry when entering a room. Guarded so StrictMode's
  // double-invoke / HMR re-runs can't stack duplicate entries.
  useEffect(() => {
    if (!inRoom) return;
    const state = window.history.state as { igra?: string } | null;
    if (state?.igra !== 'room') {
      window.history.pushState({ igra: 'room' }, '');
    }
  }, [inRoom]);

  if (!inRoom || !confirming) return null;

  return (
    <LeaveRoomDialog
      onCancel={() => setConfirming(false)}
      onConfirm={() => {
        leaveRoom();
        setConfirming(false);
      }}
    />
  );
}
