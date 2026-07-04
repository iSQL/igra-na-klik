export type RoomStatus = 'lobby' | 'in-game' | 'game-over';

export interface Player {
  id: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  isConnected: boolean;
  score: number;
  reconnectToken: string;
}

export type PublicPlayer = Omit<Player, 'reconnectToken'>;

export interface RoomSettings {
  maxPlayers: number;
  roundCount: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  avatarEmoji?: string;
  avatarColor?: string;
  text: string;
  at: number;
}

export interface Room {
  code: string;
  hostSocketId: string;
  remoteHostPlayerId: string | null;
  players: Player[];
  status: RoomStatus;
  currentGameId: string | null;
  settings: RoomSettings;
  createdAt: number;
  // Lobby chat history — capped, cleared on game start, never sent inside
  // join payloads (delivered via its own room:chat-history event).
  chatMessages: ChatMessage[];
  // Idle-room sweep bookkeeping: a room whose host is disconnected and has
  // no connected players for IDLE_ROOM_TTL_MS gets deleted by the sweeper.
  hostConnected: boolean;
  idleSince: number | null;
}

export type PublicRoom = Omit<Room, 'players' | 'chatMessages'> & {
  players: PublicPlayer[];
};

// Safe summary exposed on the public landing page via GET /api/rooms.
export interface RoomSummary {
  code: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  roundCount: 3,
};
