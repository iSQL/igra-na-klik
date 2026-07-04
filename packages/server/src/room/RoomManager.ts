import {
  Room,
  Player,
  PublicPlayer,
  PublicRoom,
  RoomSettings,
  RoomSummary,
  ChatMessage,
  DEFAULT_ROOM_SETTINGS,
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  CHAT_HISTORY_LIMIT,
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
      remoteHostPlayerId: null,
      players: [],
      status: 'lobby',
      currentGameId: null,
      settings: { ...DEFAULT_ROOM_SETTINGS, ...settings },
      createdAt: Date.now(),
      chatMessages: [],
      hostConnected: true,
      idleSince: null,
    };
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(
    roomCode: string,
    playerName: string
  ): { player: Player; room: Room; reclaimed?: boolean } | { error: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'lobby') return { error: 'Game already in progress' };

    // If a disconnected player with this name still exists, treat the
    // fresh join as them reclaiming their slot — common for phones that
    // lost their reconnect token (cleared cache, incognito, kicked-then-
    // rejoined). The slot keeps its score and avatar; we mint a new
    // reconnect token so the returning browser owns the session again.
    const existing = room.players.find((p) => p.name === playerName);
    if (existing) {
      if (existing.isConnected) return { error: 'Name already taken' };
      existing.reconnectToken = generateReconnectToken();
      existing.isConnected = true;
      return { player: existing, room, reclaimed: true };
    }

    if (room.players.length >= room.settings.maxPlayers)
      return { error: 'Room is full' };

    const player: Player = {
      id: generateId(),
      name: playerName,
      avatarColor: AVATAR_COLORS[room.players.length % AVATAR_COLORS.length],
      avatarEmoji: AVATAR_EMOJIS[room.players.length % AVATAR_EMOJIS.length],
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
    return true;
  }

  /**
   * Remove a player and invalidate their reconnect token so they can't
   * rejoin via cached localStorage. Also clears the remote-host claim if
   * they held it. Returns whether the player existed.
   */
  kickPlayer(
    roomCode: string,
    playerId: string
  ): { remoteHostCleared: boolean } | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const existed = room.players.some((p) => p.id === playerId);
    if (!existed) return null;
    let remoteHostCleared = false;
    if (room.remoteHostPlayerId === playerId) {
      room.remoteHostPlayerId = null;
      remoteHostCleared = true;
    }
    room.players = room.players.filter((p) => p.id !== playerId);
    return { remoteHostCleared };
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

  /**
   * Update a player's avatar. Only allowed in lobby — once a game is
   * running, avatars are frozen for the duration of the match so
   * leaderboards/score chips don't shift identity mid-round. Returns
   * the updated player on success.
   */
  setPlayerAvatar(
    roomCode: string,
    playerId: string,
    avatar: { avatarColor?: string; avatarEmoji?: string }
  ): { player: Player } | { error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'lobby')
      return { error: 'Avatar se može menjati samo u lobiju.' };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { error: 'Igrač nije pronađen.' };

    if (avatar.avatarColor !== undefined) {
      if (!(AVATAR_COLORS as readonly string[]).includes(avatar.avatarColor)) {
        return { error: 'Nevažeća boja.' };
      }
      player.avatarColor = avatar.avatarColor;
    }
    if (avatar.avatarEmoji !== undefined) {
      if (!(AVATAR_EMOJIS as readonly string[]).includes(avatar.avatarEmoji)) {
        return { error: 'Nevažeći emoji.' };
      }
      player.avatarEmoji = avatar.avatarEmoji;
    }
    return { player };
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  deleteRoom(roomCode: string): boolean {
    return this.rooms.delete(roomCode);
  }

  claimRemoteHost(
    roomCode: string,
    playerId: string
  ): { ok: true } | { error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.remoteHostPlayerId && room.remoteHostPlayerId !== playerId) {
      return { error: 'Neko drugi već drži kontrolu.' };
    }
    const player = room.players.find((p) => p.id === playerId);
    if (!player || !player.isConnected) {
      return { error: 'Igrač nije u sobi.' };
    }
    room.remoteHostPlayerId = playerId;
    return { ok: true };
  }

  releaseRemoteHost(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    if (room.remoteHostPlayerId !== playerId) return false;
    room.remoteHostPlayerId = null;
    return true;
  }

  clearRemoteHostIfHolder(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    if (room.remoteHostPlayerId !== playerId) return false;
    room.remoteHostPlayerId = null;
    return true;
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
    const { chatMessages: _, ...rest } = room;
    return {
      ...rest,
      players: room.players.map((p) => this.toPublicPlayer(p)),
    };
  }

  /** Safe per-room summaries for the public landing-page list. */
  listRoomSummaries(): RoomSummary[] {
    return [...this.rooms.values()].map((room) => ({
      code: room.code,
      playerCount: room.players.filter((p) => p.isConnected).length,
      maxPlayers: room.settings.maxPlayers,
      status: room.status,
    }));
  }

  addChatMessage(
    roomCode: string,
    player: Player,
    text: string
  ): ChatMessage | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const message: ChatMessage = {
      id: generateId(),
      playerId: player.id,
      playerName: player.name,
      avatarEmoji: player.avatarEmoji,
      avatarColor: player.avatarColor,
      text,
      at: Date.now(),
    };
    room.chatMessages.push(message);
    if (room.chatMessages.length > CHAT_HISTORY_LIMIT) {
      room.chatMessages.splice(0, room.chatMessages.length - CHAT_HISTORY_LIMIT);
    }
    return message;
  }

  clearChat(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) room.chatMessages = [];
  }

  setHostConnected(roomCode: string, connected: boolean): void {
    const room = this.rooms.get(roomCode);
    if (room) room.hostConnected = connected;
  }

  /**
   * Maintain each room's idleSince timestamp and return the codes of rooms
   * that have been abandoned (host disconnected AND zero connected players)
   * continuously for at least `ttl` ms. Any reconnect resets the clock.
   */
  collectIdleRooms(now: number, ttl: number): string[] {
    const expired: string[] = [];
    for (const room of this.rooms.values()) {
      const idle =
        !room.hostConnected && room.players.every((p) => !p.isConnected);
      if (!idle) {
        room.idleSince = null;
        continue;
      }
      if (room.idleSince === null) {
        room.idleSince = now;
      } else if (now - room.idleSince >= ttl) {
        expired.push(room.code);
      }
    }
    return expired;
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
