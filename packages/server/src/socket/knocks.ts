import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  GameState,
  KnockEntry,
  KnockRequest,
  KnockStatus,
  Room,
} from '@igra/shared';
import {
  GAME_DEFINITIONS,
  KNOCK_RETRY_MS,
  MAX_KNOCKS_PER_ROOM,
  MAX_PLAYER_NAME_LENGTH,
} from '@igra/shared';
import { RoomManager } from '../room/RoomManager.js';
import { GameManager } from '../game/GameManager.js';
import { generateId } from '../utils/id.js';
import { playerRoom } from './rooms.js';
import { logger } from '../logger.js';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface Knock {
  id: string;
  roomCode: string;
  socketId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  /** 'admitted' = let in, waiting for the game to end (after-game entry). */
  state: 'pending' | 'admitted';
}

/**
 * "Pokucaj": a guest asks to join a room whose game is already running, and
 * the player holding the remote-host claim answers. Knocks live only here,
 * in memory, keyed to the guest's socket — a guest who closes the tab simply
 * stops knocking. Nobody gets a seat without the holder's yes, except when
 * the game ends: the room is open to anyone then, so whoever is still at the
 * door walks in.
 */
export class KnockManager {
  private knocks = new Map<string, Knock>();
  /** `${roomCode}:${lowercased name}` → epoch ms when knocking may resume. */
  private retryAt = new Map<string, number>();

  constructor(
    private io: IoServer,
    private roomManager: RoomManager,
    private gameManager: GameManager
  ) {}

  knock(socket: IoSocket, rawCode: string, rawName: string): void {
    const fail = (message: string): void => {
      socket.emit('error', { code: 'KNOCK_ERROR', message });
    };
    if (socket.data.roomCode) return fail('Već si u sobi.');

    const roomCode = String(rawCode ?? '').toUpperCase();
    const name = String(rawName ?? '').trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    if (!name) return fail('Name required');
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return fail('Room not found');
    // A lobby takes anyone — knocking there is a stale room list.
    if (room.status === 'lobby') return fail('Soba je otvorena — uđi direktno.');
    if (!this.holderOnline(room)) {
      return fail('Niko u sobi trenutno ne drži kontrolu — sačekaj kraj igre.');
    }

    // One knock per socket: a new one replaces the old.
    this.dropBySocket(socket.id, false);

    const now = Date.now();
    for (const [k, t] of this.retryAt) if (t <= now) this.retryAt.delete(k);
    const key = this.retryKey(roomCode, name);
    const until = this.retryAt.get(key) ?? 0;
    if (until > Date.now()) {
      socket.emit('knock:closed', { roomCode, reason: 'declined', retryAt: until });
      return;
    }
    const seated = room.players.find((p) => p.name === name);
    const atDoor = [...this.knocks.values()].some(
      (k) => k.roomCode === roomCode && k.name === name
    );
    if (seated?.isConnected || atDoor) {
      socket.emit('knock:closed', { roomCode, reason: 'name-taken' });
      return;
    }
    // A disconnected seat with this name is a reclaim, which doesn't need room.
    if (!seated && room.players.length >= room.settings.maxPlayers) {
      socket.emit('knock:closed', { roomCode, reason: 'full' });
      return;
    }
    if (this.inRoom(roomCode).length >= MAX_KNOCKS_PER_ROOM) {
      return fail('Previše ljudi već kuca — pokušaj malo kasnije.');
    }

    const avatar = seated
      ? { color: seated.avatarColor, emoji: seated.avatarEmoji }
      : this.roomManager.nextAvatar(room);
    const knock: Knock = {
      id: generateId(),
      roomCode,
      socketId: socket.id,
      name,
      avatarColor: avatar.color,
      avatarEmoji: avatar.emoji,
      state: 'pending',
    };
    this.knocks.set(knock.id, knock);
    logger.info('knock', { room: roomCode, name });
    this.sendStatus(knock);
    this.syncHolder(roomCode);
  }

  cancel(socket: IoSocket): void {
    this.dropBySocket(socket.id, true);
  }

  /** The holder's "Pusti" / "Ne sad". */
  answer(socket: IoSocket, knockId: string, admit: boolean): void {
    const knock = this.knocks.get(String(knockId ?? ''));
    if (!knock || knock.state !== 'pending') return;
    const room = this.roomManager.getRoom(knock.roomCode);
    if (!room) return;
    const { roomCode, playerId, isHost } = socket.data;
    if (roomCode !== knock.roomCode) return;
    const canControl = isHost || (!!playerId && room.remoteHostPlayerId === playerId);
    if (!canControl) return;

    if (!admit) {
      const retryAt = Date.now() + KNOCK_RETRY_MS;
      this.retryAt.set(this.retryKey(knock.roomCode, knock.name), retryAt);
      this.close(knock, 'declined', retryAt);
      this.syncHolder(knock.roomCode);
      return;
    }

    if (room.status === 'lobby' || this.entryFor(room) === 'next-round') {
      this.seat(knock);
    } else {
      knock.state = 'admitted';
      this.sendStatus(knock);
    }
    this.syncHolder(knock.roomCode);
  }

  /** Game over: the room is open again, so everyone at the door comes in. */
  onGameEnded(roomCode: string): void {
    for (const knock of this.inRoom(roomCode)) this.seat(knock);
    this.syncHolder(roomCode);
  }

  onRoomDestroyed(roomCode: string): void {
    for (const knock of this.inRoom(roomCode)) this.close(knock, 'room-gone');
  }

  onSocketDisconnect(socketId: string): void {
    this.dropBySocket(socketId, true);
  }

  /**
   * Send the pending list to whoever holds control now. Called on every
   * change and whenever the claim moves (the old holder's phone gets an
   * empty list via the room-wide reset first).
   */
  syncHolder(roomCode: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;
    this.io.to(roomCode).emit('room:knocks', { knocks: [] });
    if (!room.remoteHostPlayerId) return;
    const entry = this.entryFor(room);
    const knocks: KnockRequest[] = this.inRoom(roomCode)
      .filter((k) => k.state === 'pending')
      .map((k) => ({
        knockId: k.id,
        name: k.name,
        avatarColor: k.avatarColor,
        avatarEmoji: k.avatarEmoji,
        entry,
      }));
    if (knocks.length === 0) return;
    this.io.to(playerRoom(room.remoteHostPlayerId)).emit('room:knocks', { knocks });
  }

  // --- internals ---------------------------------------------------------

  private seat(knock: Knock): void {
    this.knocks.delete(knock.id);
    const sock = this.io.sockets.sockets.get(knock.socketId);
    if (!sock || sock.data.roomCode) return;

    const result = this.roomManager.joinRoom(knock.roomCode, knock.name, {
      admittedKnock: true,
      avatar: { color: knock.avatarColor, emoji: knock.avatarEmoji },
    });
    if ('error' in result) {
      sock.emit('knock:closed', {
        roomCode: knock.roomCode,
        reason: result.error === 'Room is full' ? 'full' : 'name-taken',
      });
      return;
    }
    const { player, room, reclaimed } = result;
    sock.data.roomCode = room.code;
    sock.data.playerId = player.id;
    sock.join(room.code);
    sock.join(playerRoom(player.id));
    sock.emit('player:joined', { player, room: this.roomManager.toPublicRoom(room) });
    if (reclaimed) {
      sock.to(room.code).emit('room:player-reconnected', {
        playerId: player.id,
        player: this.roomManager.toPublicPlayer(player),
      });
    } else {
      sock.to(room.code).emit('room:player-joined', {
        player: this.roomManager.toPublicPlayer(player),
      });
    }
    if (this.gameManager.isGameActive(room.code)) {
      this.gameManager.replayStateToPlayer(room.code, player.id, sock.id);
    }
    logger.info('knock_seated', { room: room.code, name: player.name, midGame: room.status !== 'lobby' });
  }

  private close(knock: Knock, reason: 'declined' | 'room-gone', retryAt?: number): void {
    this.knocks.delete(knock.id);
    this.io.sockets.sockets
      .get(knock.socketId)
      ?.emit('knock:closed', { roomCode: knock.roomCode, reason, retryAt });
  }

  private dropBySocket(socketId: string, sync: boolean): void {
    for (const knock of [...this.knocks.values()]) {
      if (knock.socketId !== socketId) continue;
      this.knocks.delete(knock.id);
      if (sync) this.syncHolder(knock.roomCode);
    }
  }

  private sendStatus(knock: Knock): void {
    const room = this.roomManager.getRoom(knock.roomCode);
    if (!room) return;
    const holder = room.players.find((p) => p.id === room.remoteHostPlayerId);
    const status: KnockStatus = {
      knockId: knock.id,
      roomCode: knock.roomCode,
      state: knock.state,
      name: knock.name,
      avatarColor: knock.avatarColor,
      avatarEmoji: knock.avatarEmoji,
      holderName: holder?.name ?? null,
      gameId: room.currentGameId,
      progress: progressOf(this.gameManager.getGameState(room.code)),
      playerCount: room.players.filter((p) => p.isConnected).length,
      entry: this.entryFor(room),
    };
    this.io.sockets.sockets.get(knock.socketId)?.emit('knock:status', status);
  }

  /** Can the running game take a newcomer now, or only once it's over? */
  private entryFor(room: Room): KnockEntry {
    const def = room.currentGameId ? GAME_DEFINITIONS[room.currentGameId] : undefined;
    const connected = room.players.filter((p) => p.isConnected).length;
    return def?.lateJoin && connected < def.maxPlayers ? 'next-round' : 'after-game';
  }

  private holderOnline(room: Room): boolean {
    return room.players.some((p) => p.id === room.remoteHostPlayerId && p.isConnected);
  }

  private inRoom(roomCode: string): Knock[] {
    return [...this.knocks.values()].filter((k) => k.roomCode === roomCode);
  }

  private retryKey(roomCode: string, name: string): string {
    return `${roomCode}:${name.toLowerCase()}`;
  }
}

// "Pitanje 6/10" for the guest's waiting card. Kviz-style games expose a
// 0-based questionIndex + totalQuestions; others fill the generic round fields.
function progressOf(state: GameState | undefined): KnockStatus['progress'] {
  if (!state) return null;
  const d = state.data;
  if (typeof d.questionIndex === 'number' && typeof d.totalQuestions === 'number' && d.totalQuestions > 0) {
    return { current: d.questionIndex + 1, total: d.totalQuestions, unit: 'question' };
  }
  if (state.totalRounds > 0 && state.round > 0) {
    return { current: state.round, total: state.totalRounds, unit: 'round' };
  }
  return null;
}
