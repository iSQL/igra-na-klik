import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@igra/shared';

const RECONNECT_TOKEN_KEY = 'igra-reconnect-token';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
  auth: {
    reconnectToken: localStorage.getItem(RECONNECT_TOKEN_KEY) || undefined,
  },
});

// Keep auth token in sync when it changes
export function updateSocketAuth(token: string) {
  (socket.auth as Record<string, unknown>).reconnectToken = token;
}
