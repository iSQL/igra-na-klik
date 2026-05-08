import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@igra/shared';

const RECONNECT_TOKEN_KEY = 'igra-reconnect-token';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  reconnectionAttempts: Infinity,
  // Mobile browsers suspend WebSockets when the screen turns off; keep
  // trying forever so a phone that wakes up after several minutes
  // still rejoins the same player slot via the reconnect token.
  timeout: 20_000,
  auth: {
    reconnectToken: localStorage.getItem(RECONNECT_TOKEN_KEY) || undefined,
  },
});

// Keep auth token in sync when it changes
export function updateSocketAuth(token: string | undefined) {
  (socket.auth as Record<string, unknown>).reconnectToken = token;
}
