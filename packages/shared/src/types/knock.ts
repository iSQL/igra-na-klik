// "Pokucaj" — a guest asks to join a room whose game is already running.
// The player holding the remote-host claim lets them in or not.

/** When an admitted guest actually gets a seat. */
export type KnockEntry = 'next-round' | 'after-game';

/** Re-knocking the same room after a "Ne sad" is blocked for this long. */
export const KNOCK_RETRY_MS = 60_000;
/** Pending knocks one room keeps at once — more is a flood, not a party. */
export const MAX_KNOCKS_PER_ROOM = 6;

/** What the approver's phone shows: who is at the door. */
export interface KnockRequest {
  knockId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  entry: KnockEntry;
}

/** What the guest's phone shows while waiting at the door. */
export interface KnockStatus {
  knockId: string;
  roomCode: string;
  /** 'pending' = waiting for an answer; 'admitted' = let in, seat comes when
   *  the game ends (after-game entry only). */
  state: 'pending' | 'admitted';
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  /** Who decides — the remote-host holder's name. */
  holderName: string | null;
  gameId: string | null;
  /** Game progress, e.g. question 6 of 10, when the game exposes it. */
  progress: { current: number; total: number; unit: 'question' | 'round' } | null;
  playerCount: number;
  entry: KnockEntry;
}
