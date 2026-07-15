import type {
  PublicPlayer,
  Player,
  PublicRoom,
  RoomSettings,
  ChatMessage,
} from './room.js';
import type { GameState } from './game.js';
import type { DrawOp } from './draw-guess.js';
import type { QuizImportQuestion } from '../games/quiz-import.js';
import type { KoSamJaImportQuestion } from '../games/ko-sam-ja-import.js';
import type { KoSamJaCategory } from './ko-sam-ja.js';
import type { TajniAgentiMode } from './tajni-agenti.js';
import type { TajniAgentiImportPack } from '../games/tajni-agenti-import.js';
import type { Language } from '../i18n/types.js';
import type { GluvoDobaDeathReveal } from './gluvo-doba.js';
import type { GluvoDobaPack } from '../games/gluvo-doba-import.js';
import type { HotPotatoMode } from './hot-potato.js';
import type { EmojiImportPuzzle } from './emoji-zagonetke.js';

export interface ServerToClientEvents {
  'host:room-created': (data: { roomCode: string; room: PublicRoom }) => void;
  'player:joined': (data: { player: Player; room: PublicRoom }) => void;
  'room:player-joined': (data: { player: PublicPlayer }) => void;
  'room:player-left': (data: { playerId: string }) => void;
  'room:player-removed': (data: { playerId: string }) => void;
  'room:player-reconnected': (data: { playerId: string }) => void;
  'room:player-updated': (data: { player: PublicPlayer }) => void;
  'room:state-update': (data: { room: PublicRoom }) => void;
  'room:remote-host-changed': (data: {
    remoteHostPlayerId: string | null;
  }) => void;
  'game:started': (data: { gameId: string; gameState: GameState }) => void;
  'game:state-update': (data: { gameState: GameState }) => void;
  // Per-player private slice only. The shared ("host view") data already
  // arrives via the game:state-update room broadcast — re-sending it per
  // player doubled every state emit on the wire.
  'game:player-state': (data: {
    playerData: Record<string, Record<string, unknown>>;
  }) => void;
  // Lightweight once-a-second countdown tick, sent instead of a full
  // game:state-update when nothing but the clock changed.
  'game:timer': (data: { timeRemaining: number }) => void;
  // Incremental drawing ops (draw-guess strokes/fills). Clients append to
  // the operations array in data.host; full snapshots (undo/clear/phase
  // changes/reconnect) remain the authority and replace it wholesale.
  'game:ops-append': (data: { gameId: string; ops: DrawOp[] }) => void;
  'game:ended': (data: { finalScores: { playerId: string; score: number }[] }) => void;
  'game:phase-changed': (data: { phase: string; timeRemaining: number }) => void;
  'room:chat-message': (data: { message: ChatMessage }) => void;
  'room:chat-history': (data: { messages: ChatMessage[] }) => void;
  'room:kicked': (data: { reason?: string }) => void;
  'room:destroyed': (data: { reason?: string }) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'host:create-room': (data: { settings?: Partial<RoomSettings> }) => void;
  'player:join-room': (data: {
    roomCode: string;
    playerName: string;
    reconnectToken?: string;
  }) => void;
  // Create a hostless room from a phone: the creator joins as a regular
  // player and automatically receives the remote-host claim. Responds with
  // player:joined like a normal join.
  'player:create-room': (data: { playerName: string }) => void;
  'host:start-game': (data: {
    gameId: string;
    customQuestions?: QuizImportQuestion[];
    slepiRounds?: number;
    geoPackId?: string;
    geoMode?: 'predefined' | 'custom';
    customPhotosPerPlayer?: number;
    koSamJaCategory?: KoSamJaCategory;
    customKoSamJaQuestions?: KoSamJaImportQuestion[];
    customTajniAgentiPack?: TajniAgentiImportPack;
    // Tajni agenti game mode ('classic' default). Re-validated server-side
    // (classic needs ≥4 players, duet/coop need ≥2).
    tajniAgentiMode?: TajniAgentiMode;
    // Gluvo doba host config: discussion timer, what a death reveals
    // ('role' | 'team' | 'none'), the peaceful-first-night rule, and the
    // optional neutral (Lesnik/Morana) and Vila roles.
    gluvoDobaDiscussionSeconds?: number;
    gluvoDobaDeathReveal?: GluvoDobaDeathReveal;
    gluvoDobaFirstNightPeace?: boolean;
    gluvoDobaBajacica?: boolean;
    // A selected role pack fully defines the roster (overrides the bands +
    // neutral/vila/bajačica toggles). Re-validated server-side.
    gluvoDobaPack?: GluvoDobaPack;
    // Gluvo doba tutorial mode: shows the "?" roles sheet + guide texts
    // (hidden in a normal game) and phases advance on the moderator's
    // "next phase" button instead of the timers.
    gluvoDobaTutorial?: boolean;
    // Round / stroke counts for the newer games (host-configurable).
    fakeArtistRounds?: number;
    fakeArtistStrokes?: number;
    koBiPreRounds?: number;
    // Crtaj i pogodi: per-turn drawing time in seconds (60/120/180).
    drawTimeLimit?: number;
    pogodiGodinuRounds?: number;
    // Selected "Pogodi broj" question pack (id from GET /api/pogodi-broj-packs).
    // Empty/absent → the built-in question bank.
    pogodiBrojPackId?: string;
    // Generic round count for games in GAME_ROUND_CONFIG (quiz, draw-guess,
    // fibbage, geo-pogodi, foto-kviz, ko-sam-ja, spot-it). Each module
    // clamps it to its own range.
    roundCount?: number;
    // Zavet (bolji-zivot) tutorial mode: shows in-game hints + the "?" rules sheet,
    // and phases advance on the admin's "next phase" button instead of the
    // timers (the parallel slap window is event-driven, no timer, so it
    // behaves the same as in a normal game).
    boljiZivotTutorial?: boolean;
    // Vruć krompir: how the bomb is passed on ('sequential' = next in order,
    // 'choose' = holder picks). Defaults to 'sequential' server-side.
    hotPotatoMode?: HotPotatoMode;
    // Emoji zagonetke: optional imported puzzle pack (replaces the built-in
    // bank for the session) + whether progressive letter hints are enabled
    // (default true). Round count rides the generic `roundCount` field.
    customEmojiPuzzles?: EmojiImportPuzzle[];
    emojiHints?: boolean;
    // Host's current UI language — a content hint so the server can pick
    // the matching draw-words bank. NOT a room-wide language sync; each
    // device's chrome language is its own per-device preference.
    language?: Language;
  }) => void;
  'host:stop-game': () => void;
  // Close/delete the room entirely. Accepted from the host socket or the
  // remote-host holder; kicks all players, host auto-creates a fresh room.
  'host:close-room': () => void;
  // Lobby chat — only accepted while room.status === 'lobby'.
  'player:send-chat': (data: { text: string }) => void;
  'host:kick-player': (data: { playerId: string }) => void;
  'player:claim-remote-host': () => void;
  'player:release-remote-host': () => void;
  'player:leave-room': () => void;
  'player:set-avatar': (data: {
    avatarColor?: string;
    avatarEmoji?: string;
  }) => void;
  'player:set-name': (data: { name: string }) => void;
  'game:player-action': (data: {
    action: string;
    data: Record<string, unknown>;
  }) => void;
  'host:game-action': (data: {
    action: string;
    data?: Record<string, unknown>;
  }) => void;
}

/**
 * The host:start-game payload as a standalone type — clients keep the last
 * one around to offer a one-tap "play again" with identical settings.
 */
export type HostStartGamePayload = Parameters<
  ClientToServerEvents['host:start-game']
>[0];

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
  isHost?: boolean;
}
