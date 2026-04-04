import type { PublicPlayer, Player, PublicRoom, RoomSettings } from './room.js';
import type { GameState } from './game.js';

export interface ServerToClientEvents {
  'host:room-created': (data: { roomCode: string; room: PublicRoom }) => void;
  'player:joined': (data: { player: Player; room: PublicRoom }) => void;
  'room:player-joined': (data: { player: PublicPlayer }) => void;
  'room:player-left': (data: { playerId: string }) => void;
  'room:player-reconnected': (data: { playerId: string }) => void;
  'room:state-update': (data: { room: PublicRoom }) => void;
  'game:started': (data: { gameId: string; gameState: GameState }) => void;
  'game:state-update': (data: { gameState: GameState }) => void;
  'game:player-state': (data: { gameState: GameState }) => void;
  'game:ended': (data: { finalScores: { playerId: string; score: number }[] }) => void;
  'game:phase-changed': (data: { phase: string; timeRemaining: number }) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'host:create-room': (data: { settings?: Partial<RoomSettings> }) => void;
  'player:join-room': (data: {
    roomCode: string;
    playerName: string;
    reconnectToken?: string;
  }) => void;
  'host:start-game': (data: { gameId: string }) => void;
  'host:stop-game': () => void;
  'game:player-action': (data: {
    action: string;
    data: Record<string, unknown>;
  }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
  isHost?: boolean;
}
