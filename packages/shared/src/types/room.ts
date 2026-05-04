export type RoomStatus = 'lobby' | 'in-game' | 'game-over';

export interface Player {
  id: string;
  name: string;
  avatarColor: string;
  isConnected: boolean;
  score: number;
  reconnectToken: string;
}

export type PublicPlayer = Omit<Player, 'reconnectToken'>;

export interface RoomSettings {
  maxPlayers: number;
  roundCount: number;
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
}

export type PublicRoom = Omit<Room, 'players'> & { players: PublicPlayer[] };

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  roundCount: 3,
};
