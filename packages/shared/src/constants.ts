export const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 2;
export const MAX_PLAYERS_DEFAULT = 8;
export const RECONNECT_GRACE_MS = 5 * 60_000;

export const AVATAR_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#ec407a',
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
