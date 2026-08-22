export type HotPotatoPhase =
  | 'intro'
  | 'passing'
  | 'question'
  | 'picking'
  | 'exploded'
  | 'final-leaderboard'
  | 'ended';

/**
 * How the „krompir" is handed on:
 *  - `sequential` — tap „Prosledi →", bomb goes to the next living player in
 *    the fixed rotation.
 *  - `choose` — the holder picks any other living player to receive it.
 *  - `kviz` — a quiz question (from the selected kviz packs) lands on a
 *    random player; 5s to answer. Correct → preview of the next question
 *    (text only) + pick who gets it. Wrong/timeout → 💥 eliminated. Uses the
 *    `question`/`picking` phases instead of `passing`.
 */
export type HotPotatoMode = 'sequential' | 'choose' | 'kviz';

/** Public question slice for kviz mode — never carries the correct answer. */
export interface HotPotatoQuestion {
  /**
   * Runtime id pitanja — telefon ga kači uz prijavu „netačno" i uz ocenu.
   * Ne nosi nijedan deo odgovora.
   */
  id?: string;
  text: string;
  options: { index: number; text: string; color: string }[];
  imageUrl?: string;
}

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

  // passing / question / picking
  /** Player currently holding the bomb. */
  holderId?: string;
  category?: string;

  // kviz mode — current question (question/picking/exploded phases).
  question?: HotPotatoQuestion;
  /** Revealed only in the `exploded` phase (and after a correct answer). */
  correctIndex?: number;
  /** kviz mode: the holder answered correctly (drives the ✅ beat). */
  answeredCorrectly?: boolean;
  /** kviz mode: which option the holder picked (exploded reveal). */
  answeredIndex?: number;

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
  /**
   * kviz mode, `picking` phase, holder only: text of the NEXT question —
   * the reward preview for a correct answer. Never contains options/answer.
   */
  nextQuestionText?: string;
}
