import { create } from 'zustand';
import type { Player, PublicRoom } from '@igra/shared';

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
  reset: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  player: null,
  room: null,
  reconnectToken: localStorage.getItem(RECONNECT_TOKEN_KEY),
  isConnected: false,
  setPlayer: (player) => {
    localStorage.setItem(RECONNECT_TOKEN_KEY, player.reconnectToken);
    set({ player, reconnectToken: player.reconnectToken });
  },
  setRoom: (room) => set({ room }),
  setReconnectToken: (token) => {
    localStorage.setItem(RECONNECT_TOKEN_KEY, token);
    set({ reconnectToken: token });
  },
  setConnected: (connected) => set({ isConnected: connected }),
  reset: () => {
    localStorage.removeItem(RECONNECT_TOKEN_KEY);
    set({ player: null, room: null, reconnectToken: null, isConnected: false });
  },
}));
