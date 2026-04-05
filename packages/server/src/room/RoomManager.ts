import {
  Room,
  Player,
  PublicPlayer,
  PublicRoom,
  RoomSettings,
  DEFAULT_ROOM_SETTINGS,
  AVATAR_COLORS,
  generateRoomCode,
} from '@igra/shared';
import { generateId, generateReconnectToken } from '../utils/id.js';

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(hostSocketId: string, settings?: Partial<RoomSettings>): Room {
    const code = this.generateUniqueCode();
    const room: Room = {
      code,
      hostSocketId,
      players: [],
      status: 'lobby',
      currentGameId: null,
      settings: { ...DEFAULT_ROOM_SETTINGS, ...settings },
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(
    roomCode: string,
    playerName: string
  ): { player: Player; room: Room } | { error: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'lobby') return { error: 'Game already in progress' };
    if (room.players.length >= room.settings.maxPlayers)
      return { error: 'Room is full' };
    if (room.players.some((p) => p.name === playerName))
      return { error: 'Name already taken' };

    const player: Player = {
      id: generateId(),
      name: playerName,
      avatarColor: AVATAR_COLORS[room.players.length % AVATAR_COLORS.length],
      isConnected: true,
      score: 0,
      reconnectToken: generateReconnectToken(),
    };

    room.players.push(player);
    return { player, room };
  }

  removePlayer(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0 && room.status === 'lobby') {
      this.rooms.delete(roomCode);
    }
    return true;
  }

  setPlayerConnected(
    roomCode: string,
    playerId: string,
    connected: boolean
  ): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return false;
    player.isConnected = connected;
    return true;
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  findPlayerByReconnectToken(
    token: string
  ): { roomCode: string; playerId: string } | undefined {
    for (const [code, room] of this.rooms) {
      const player = room.players.find((p) => p.reconnectToken === token);
      if (player) return { roomCode: code, playerId: player.id };
    }
    return undefined;
  }

  toPublicPlayer(player: Player): PublicPlayer {
    const { reconnectToken: _, ...publicPlayer } = player;
    return publicPlayer;
  }

  toPublicRoom(room: Room): PublicRoom {
    return {
      ...room,
      players: room.players.map((p) => this.toPublicPlayer(p)),
    };
  }

  getActiveRoomCode(): string | null {
    for (const code of this.rooms.keys()) return code;
    return null;
  }

  private generateUniqueCode(): string {
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));
    return code;
  }
}
