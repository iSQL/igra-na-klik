import { create } from 'zustand';
import type { ChatMessage, PublicPlayer, PublicRoom } from '@igra/shared';
import { CHAT_HISTORY_LIMIT } from '@igra/shared';

export type HostStatus =
  | 'disconnected'
  | 'creating'
  | 'lobby'
  | 'game-select'
  | 'in-game'
  | 'game-over';

interface RoomStore {
  room: PublicRoom | null;
  players: PublicPlayer[];
  status: HostStatus;
  remoteHostPlayerId: string | null;
  chatMessages: ChatMessage[];
  // Set right before this TV emits host:close-room, so the room:destroyed
  // handler can tell an intentional close (redirect to the landing page)
  // from a remote-host teardown (auto-create a fresh room).
  selfClosed: boolean;
  setSelfClosed: (v: boolean) => void;
  setRoom: (room: PublicRoom) => void;
  addPlayer: (player: PublicPlayer) => void;
  removePlayer: (playerId: string) => void;
  setPlayerConnected: (playerId: string, connected: boolean) => void;
  updatePlayer: (player: PublicPlayer) => void;
  setStatus: (status: HostStatus) => void;
  setRemoteHostPlayerId: (id: string | null) => void;
  addChatMessage: (message: ChatMessage) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  clearChat: () => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  room: null,
  players: [],
  status: 'disconnected',
  remoteHostPlayerId: null,
  chatMessages: [],
  selfClosed: false,
  setSelfClosed: (v) => set({ selfClosed: v }),
  setRoom: (room) =>
    set({
      room,
      players: room.players as PublicPlayer[],
      remoteHostPlayerId: room.remoteHostPlayerId ?? null,
    }),
  // Upsert: a returning player (rejoin / reconnect / reclaim) may already be
  // on the roster (greyed) or may have been dropped — either way end up with
  // exactly one up-to-date entry.
  addPlayer: (player) =>
    set((state) =>
      state.players.some((p) => p.id === player.id)
        ? {
            players: state.players.map((p) =>
              p.id === player.id ? { ...p, ...player } : p
            ),
          }
        : { players: [...state.players, player] }
    ),
  removePlayer: (playerId) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
    })),
  setPlayerConnected: (playerId, connected) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, isConnected: connected } : p
      ),
    })),
  updatePlayer: (updated) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === updated.id ? { ...p, ...updated } : p
      ),
    })),
  setStatus: (status) => set({ status }),
  setRemoteHostPlayerId: (id) => set({ remoteHostPlayerId: id }),
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message].slice(-CHAT_HISTORY_LIMIT),
    })),
  setChatMessages: (messages) => set({ chatMessages: messages }),
  clearChat: () => set({ chatMessages: [] }),
  reset: () =>
    set({
      room: null,
      players: [],
      status: 'disconnected',
      remoteHostPlayerId: null,
      chatMessages: [],
    }),
}));
