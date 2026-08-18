import { socket } from './socket';
import { usePlayerStore } from './store/playerStore';
import { useGameStore } from './store/gameStore';
import { useNavStore } from './store/navStore';

/**
 * How long we wait for the server's `room:kicked` answer before tearing the
 * room down locally anyway.
 */
const LEAVE_FALLBACK_MS = 1200;

/**
 * Leave the room from any of the three entry points (LeaveRoomButton, the
 * PlayerMenu row, the Back-button guard).
 *
 * The happy path is server-driven: `player:leave-room` → the server frees the
 * seat and answers `room:kicked`, which App.tsx turns into "back to the join
 * screen". But on a phone — especially an installed PWA that was backgrounded
 * — the socket can be *believed* connected while its transport is already
 * dead: socket.io then buffers the emit, no answer ever comes back, and the
 * button looks broken ("nothing happens"). So we always guarantee the exit
 * locally: if we're still in the room after a short grace, drop the reconnect
 * token, clear the stores and bounce the socket ourselves. Bouncing matters —
 * the server only frees the seat on a real disconnect, and the cleared token
 * stops the fresh connection from reclaiming it.
 */
export function leaveRoom() {
  socket.emit('player:leave-room');

  const finish = () => {
    if (!usePlayerStore.getState().player) return; // server already handled it
    useGameStore.getState().resetGame();
    usePlayerStore.getState().reset();
    useNavStore.getState().setScreen('lobby');
    socket.disconnect();
    socket.connect();
  };

  if (!socket.connected) {
    // Offline: there is nobody to ask, so leave immediately.
    finish();
    return;
  }
  setTimeout(finish, LEAVE_FALLBACK_MS);
}
