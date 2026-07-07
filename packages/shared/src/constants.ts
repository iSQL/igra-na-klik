export const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 3;
export const MAX_PLAYERS_DEFAULT = 8;
export const RECONNECT_GRACE_MS = 5 * 60_000;

// Server-side caps for public deployments. MAX_ROOMS keeps the room-code
// space from ever being exhausted (23^3 ≈ 12k codes, so 200 concurrent
// rooms leaves code generation collision-free); player names are clamped
// server-side regardless of what the client sends.
export const MAX_ROOMS = 200;
export const MAX_PLAYER_NAME_LENGTH = 20;

// Lobby chat limits (pre-game chat only).
export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_THROTTLE_MS = 750;

// Abandoned-room sweep: rooms with a disconnected host and zero connected
// players for this long get deleted automatically.
export const IDLE_ROOM_TTL_MS = 5 * 60_000;
export const IDLE_SWEEP_INTERVAL_MS = 30_000;

// Warm, storybook-muted hues tuned to the zabari.net navy/gold/cream brand —
// still eight clearly distinct player identities on a navy canvas.
export const AVATAR_COLORS = [
  '#c75146',
  '#4f80b8',
  '#5fa173',
  '#c29b47',
  '#8b6bae',
  '#4f9e96',
  '#ce7c3a',
  '#c26588',
] as const;

// Single-character emoji set used as the avatar symbol. Default seeded by
// join order (mod length). Players can change to any value from this list
// in the lobby via `player:set-avatar`. Server validates against this list.
export const AVATAR_EMOJIS = [
  '🐶',
  '🐱',
  '🦊',
  '🐼',
  '🐯',
  '🦁',
  '🐸',
  '🐵',
  '🦄',
  '🐙',
  '🐧',
  '🦉',
  '🐝',
  '🦋',
  '🐢',
  '🐳',
  '🍕',
  '🍔',
  '🍩',
  '🍉',
  '⚽',
  '🎸',
  '🚀',
  '👾',
] as const;
