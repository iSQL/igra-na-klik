import { create } from 'zustand';
import type { Player, PublicRoom } from '@igra/shared';
import { updateSocketAuth } from '../socket';

const RECONNECT_TOKEN_KEY = 'igra-reconnect-token';

interface PlayerStore {
  player: Player | null;
  room: PublicRoom | null;
  reconnectToken: string | null;
  isConnected: boolean;
  setPlayer: (player: Player) => void;
  setRoom: (room: PublicRoom) => void;
  setReconnectToken: (token: string) => void;
  setConnected: (connected: boolean) => void;
  setRemoteHostPlayerId: (id: string | null) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  player: null,
  room: null,
  reconnectToken: localStorage.getItem(RECONNECT_TOKEN_KEY),
  isConnected: false,
  setPlayer: (player) => {
    localStorage.setItem(RECONNECT_TOKEN_KEY, player.reconnectToken);
    updateSocketAuth(player.reconnectToken);
    set({ player, reconnectToken: player.reconnectToken });
  },
  setRoom: (room) => set({ room }),
  setReconnectToken: (token) => {
    localStorage.setItem(RECONNECT_TOKEN_KEY, token);
    updateSocketAuth(token);
    set({ reconnectToken: token });
  },
  setConnected: (connected) => set({ isConnected: connected }),
  setRemoteHostPlayerId: (id) =>
    set((state) =>
      state.room
        ? { room: { ...state.room, remoteHostPlayerId: id } }
        : state
    ),
  reset: () => {
    localStorage.removeItem(RECONNECT_TOKEN_KEY);
    updateSocketAuth(undefined);
    set({ player: null, room: null, reconnectToken: null, isConnected: false });
  },
}));
