import { create } from 'zustand';
import type { GameFlowState } from '@igra/shared';
import { socket } from '../socket';

interface FlowStore {
  /** Platform flow of the running game (pause, waiting-on, skip). */
  flow: GameFlowState | null;
  /** playerId → epoch ms this phone saw them drop ("van mreže 0:40"). */
  offlineSince: Record<string, number>;
  /** Full-screen in-game panel opened from the player menu. */
  panel: 'players' | 'end' | null;
  setPanel: (panel: FlowStore['panel']) => void;
}

export const useFlowStore = create<FlowStore>((set) => ({
  flow: null,
  offlineSince: {},
  panel: null,
  setPanel: (panel) => set({ panel }),
}));

export function flowAction(
  action: 'pause' | 'resume' | 'skip' | 'stop-waiting',
  playerId?: string
): void {
  socket.emit('host:flow-action', { action, ...(playerId ? { playerId } : {}) });
}

/** m:ss from a minute up, plain seconds below it. */
export function formatClock(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

/** Wire the flow events; returns the cleanup. Called once from App. */
export function bindFlowSocket(): () => void {
  const onFlow = ({ flow }: { flow: GameFlowState }) =>
    useFlowStore.setState((s) => {
      // The server knows when each player dropped — including drops this phone
      // missed while it was offline itself. Shift into this phone's clock.
      const skew = Date.now() - flow.serverNow;
      const offlineSince = { ...s.offlineSince };
      for (const [id, at] of Object.entries(flow.offlineSince ?? {})) {
        offlineSince[id] = at + skew;
      }
      return { flow, offlineSince };
    });
  const onReset = () => useFlowStore.setState({ flow: null, panel: null });
  const onLeft = ({ playerId }: { playerId: string }) =>
    useFlowStore.setState((s) => ({
      offlineSince: { ...s.offlineSince, [playerId]: s.offlineSince[playerId] ?? Date.now() },
    }));
  const onBack = ({ playerId }: { playerId: string }) =>
    useFlowStore.setState((s) => {
      if (!(playerId in s.offlineSince)) return s;
      const { [playerId]: _, ...rest } = s.offlineSince;
      return { offlineSince: rest };
    });
  socket.on('game:flow', onFlow);
  socket.on('game:started', onReset);
  socket.on('game:ended', onReset);
  socket.on('room:player-left', onLeft);
  socket.on('room:player-reconnected', onBack);
  socket.on('room:player-removed', onBack);
  return () => {
    socket.off('game:flow', onFlow);
    socket.off('game:started', onReset);
    socket.off('game:ended', onReset);
    socket.off('room:player-left', onLeft);
    socket.off('room:player-reconnected', onBack);
    socket.off('room:player-removed', onBack);
  };
}
