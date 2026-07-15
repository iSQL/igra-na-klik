export type HotPotatoPhase =
  | 'intro'
  | 'passing'
  | 'exploded'
  | 'final-leaderboard'
  | 'ended';

/**
 * How the „krompir" is handed on:
 *  - `sequential` — tap „Prosledi →", bomb goes to the next living player in
 *    the fixed rotation.
 *  - `choose` — the holder picks any other living player to receive it.
 */
export type HotPotatoMode = 'sequential' | 'choose';

/** Public, per-player summary shown on the TV and every phone. */
export interface HotPotatoPlayerLite {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  alive: boolean;
}

export interface HotPotatoLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

/**
 * Public "host view" data. Broadcast to the TV and (stripped of playerData)
 * to every controller — so it must NEVER contain the hidden fuse. Only who
 * holds the bomb, who is alive, and the current category are public.
 */
export interface HotPotatoHostData {
  mode: HotPotatoMode;
  round: number;
  /** Number of players still alive. */
  aliveCount: number;
  players: HotPotatoPlayerLite[];

  // passing
  /** Player currently holding the bomb. */
  holderId?: string;
  category?: string;

  // exploded
  /** Player who was holding the bomb when it blew up. */
  explodedId?: string;

  // final-leaderboard / ended
  winnerId?: string;
  leaderboard?: HotPotatoLeaderboardEntry[];
}

/**
 * Per-player private slice. Everything a phone needs is derivable from the
 * public host data (isHolder = holderId === myId), so this stays minimal.
 */
export interface HotPotatoControllerData {
  /** True once this player has been eliminated. */
  eliminated?: boolean;
}
