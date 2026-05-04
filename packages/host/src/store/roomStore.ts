import { create } from 'zustand';
import type { PublicPlayer, PublicRoom } from '@igra/shared';

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
  setRoom: (room: PublicRoom) => void;
  addPlayer: (player: PublicPlayer) => void;
  removePlayer: (playerId: string) => void;
  setPlayerConnected: (playerId: string, connected: boolean) => void;
  setStatus: (status: HostStatus) => void;
  setRemoteHostPlayerId: (id: string | null) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  room: null,
  players: [],
  status: 'disconnected',
  remoteHostPlayerId: null,
  setRoom: (room) =>
    set({
      room,
      players: room.players as PublicPlayer[],
      remoteHostPlayerId: room.remoteHostPlayerId ?? null,
    }),
  addPlayer: (player) =>
    set((state) => ({ players: [...state.players, player] })),
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
  setStatus: (status) => set({ status }),
  setRemoteHostPlayerId: (id) => set({ remoteHostPlayerId: id }),
  reset: () =>
    set({
      room: null,
      players: [],
      status: 'disconnected',
      remoteHostPlayerId: null,
    }),
}));
