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
  // null for hostless rooms — created from a phone, no TV/host screen.
  hostSocketId: string | null;
  // Hostless rooms live and die with their players: the creator gets the
  // remote-host claim automatically, and the claim transfers to another
  // connected player instead of destroying the room when the holder leaves.
  hostless: boolean;
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

// A face in the public room list: colour + emoji only. Deliberately carries
// no name and no id, so /api/rooms stays anonymous while a passer-by can
// still see that someone is actually waiting in the room.
export interface RoomSummaryAvatar {
  color: string;
  emoji: string;
}

// Safe summary exposed on the public landing page via GET /api/rooms.
export interface RoomSummary {
  code: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  avatars: RoomSummaryAvatar[];
}

// Room cap must fit the biggest game (Gluvo doba plays up to 15) — the
// per-game min/max in GAME_DEFINITIONS gates game starts, not room joins.
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 15,
  roundCount: 3,
};
