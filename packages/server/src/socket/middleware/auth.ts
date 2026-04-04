import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';

type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function authMiddleware(socket: IoSocket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.reconnectToken as string | undefined;
  if (token) {
    (socket as unknown as { _reconnectToken: string })._reconnectToken = token;
  }
  next();
}

export function getReconnectToken(socket: IoSocket): string | undefined {
  return (socket as unknown as { _reconnectToken?: string })._reconnectToken;
}
