import { create } from 'zustand';
import type { KnockRequest, KnockStatus } from '@igra/shared';
import { socket } from '../socket';
import { haptics } from '../utils/haptics';

type ClosedReason = 'declined' | 'room-gone' | 'full' | 'name-taken';

interface KnockStore {
  // --- guest side ---
  /** This phone's knock while it waits at a door (null = not knocking). */
  status: KnockStatus | null;
  /** roomCode → epoch ms when knocking that room is allowed again. */
  retryAt: Record<string, number>;
  /** Last way a knock ended, for the join screen's one-line notice. */
  closed: { roomCode: string; reason: ClosedReason } | null;
  // --- holder side ---
  /** Guests at the door (only ever non-empty on the remote-host holder). */
  requests: KnockRequest[];
  /** The banner was dismissed for these ids — they wait in the ⋯ menu. */
  collapsed: string[];

  knock: (roomCode: string, playerName: string) => void;
  cancel: () => void;
  clearClosed: () => void;
  answer: (knockId: string, admit: boolean) => void;
  collapse: (knockId: string) => void;
}

export const useKnockStore = create<KnockStore>((set) => ({
  status: null,
  retryAt: {},
  closed: null,
  requests: [],
  collapsed: [],

  knock: (roomCode, playerName) => {
    set({ closed: null });
    socket.emit('player:knock', { roomCode, playerName });
  },
  cancel: () => {
    socket.emit('player:cancel-knock');
    set({ status: null });
  },
  clearClosed: () => set({ closed: null }),
  answer: (knockId, admit) => {
    socket.emit('host:answer-knock', { knockId, admit });
    // Optimistic: the server's room:knocks confirms a moment later.
    set((s) => ({ requests: s.requests.filter((r) => r.knockId !== knockId) }));
  },
  collapse: (knockId) =>
    set((s) => (s.collapsed.includes(knockId) ? s : { collapsed: [...s.collapsed, knockId] })),
}));

/** Wire the knock events; returns the cleanup. Called once from App. */
export function bindKnockSocket(): () => void {
  const onStatus = (status: KnockStatus) => useKnockStore.setState({ status, closed: null });
  const onClosed = ({
    roomCode,
    reason,
    retryAt,
  }: {
    roomCode: string;
    reason: ClosedReason;
    retryAt?: number;
  }) =>
    useKnockStore.setState((s) => ({
      status: null,
      closed: { roomCode, reason },
      retryAt: retryAt ? { ...s.retryAt, [roomCode]: retryAt } : s.retryAt,
    }));
  const onList = ({ knocks }: { knocks: KnockRequest[] }) => {
    const before = new Set(useKnockStore.getState().requests.map((r) => r.knockId));
    // One light buzz per NEW guest — only the holder ever gets a list.
    if (knocks.some((k) => !before.has(k.knockId))) haptics.tap();
    const live = new Set(knocks.map((k) => k.knockId));
    useKnockStore.setState((s) => ({
      requests: knocks,
      collapsed: s.collapsed.filter((id) => live.has(id)),
    }));
  };
  // Seated (admitted, or the game ended): the knock is done. Any door list is
  // from an earlier room — a holder gets a fresh one right after this.
  const onJoined = () =>
    useKnockStore.setState({ status: null, closed: null, requests: [], collapsed: [] });

  socket.on('knock:status', onStatus);
  socket.on('knock:closed', onClosed);
  socket.on('room:knocks', onList);
  socket.on('player:joined', onJoined);
  return () => {
    socket.off('knock:status', onStatus);
    socket.off('knock:closed', onClosed);
    socket.off('room:knocks', onList);
    socket.off('player:joined', onJoined);
  };
}
