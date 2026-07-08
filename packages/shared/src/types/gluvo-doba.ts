export type GluvoDobaPhase =
  | 'podela-uloga'
  | 'noc'
  | 'osveta'
  | 'zora'
  | 'diskusija'
  | 'glasanje'
  | 'presuda'
  | 'kraj'
  | 'ended';

export type GluvoDobaRoleId =
  | 'vukodlak'
  | 'vampir'
  | 'todorac'
  | 'drekavac'
  | 'bauk'
  | 'zmaj'
  | 'vidovnjak' // display name "Vračara" — id kept for wire compatibility
  | 'zduhac'
  | 'sudjaja'
  | 'knez'
  | 'raskovnik'
  | 'bajacica'
  | 'vila'
  | 'domacin'
  | 'lesnik'
  | 'morana';

export type GluvoDobaTeam = 'vukodlaci' | 'selo' | 'neutralci';

/** What the village learns about a dead player (host config). */
export type GluvoDobaDeathReveal = 'role' | 'team' | 'none';

export type GluvoDobaDeathCause =
  | 'wolves'
  | 'morana'
  | 'osveta'
  | 'lynch'
  | 'disappeared';

export interface GluvoDobaPlayerInfo {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  alive: boolean;
}

export interface GluvoDobaDeath {
  playerId: string;
  name: string;
  cause: GluvoDobaDeathCause;
  // Populated per the death-reveal config ('role' → roleId, 'team' → team).
  roleId?: GluvoDobaRoleId;
  team?: GluvoDobaTeam;
}

export interface GluvoDobaTargetOption {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
}

export interface GluvoDobaVoteTallyEntry {
  playerId: string;
  name: string;
  votes: number;
}

export interface GluvoDobaFinalRole {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  roleId: GluvoDobaRoleId;
  alive: boolean;
}

/**
 * Shared "host view" data — broadcast to EVERY device (playerData is
 * stripped from the broadcast). MUST NOT contain role identities of living
 * players, anyone's night targets, or per-player vote choices before the
 * presuda tally. Anonymous aggregates only. Exceptions that ARE public by
 * design: rolesInPlay (the setup is open knowledge), knezRevealed (his own
 * day power), zduhacSaved (his save reveals him — that's the cost), and
 * mutedToday (the village sees who the Bauk silenced).
 */
export interface GluvoDobaHostData {
  day: number;
  players: GluvoDobaPlayerInfo[];
  /** The role composition of this match — open setup knowledge. */
  rolesInPlay: { roleId: GluvoDobaRoleId; count: number }[];
  /** Set once the Knez reveals himself; persists for the rest of the game. */
  knezRevealed?: { playerId: string; name: string };

  // noc: anonymous progress only.
  actedCount?: number;
  totalActors?: number;

  // osveta: what the room is allowed to know. During a night-context
  // osveta the banner stays neutral ("Noć se produžava…") so the room
  // can't tell that the Suđaja fell before dawn.
  osvetaPublic?: boolean;

  // zora — deaths of the past night (incl. osveta victim + disappearances)
  // and the anonymous suspicion-whisper aggregate.
  deaths?: GluvoDobaDeath[];
  whisperTop?: { name: string; count: number }[];
  /** First night passed without wolf bloodshed (config flavour). */
  peacefulFirstNight?: boolean;
  /** The Zduhać intercepted the wolves tonight — publicly revealed. */
  zduhacSaved?: { playerId: string; name: string };
  /** Bauk's victim — loses today's vote (public, so the table can verify). */
  mutedToday?: { playerId: string; name: string };

  // glasanje: anonymous progress only.
  votedCount?: number;
  totalVoters?: number;

  // presuda — public on purpose (discussion fuel).
  lynched?: GluvoDobaDeath | null; // null = 'Selo nije odlučilo'
  voteTally?: GluvoDobaVoteTallyEntry[];
  skipVotes?: number;
  osvetaVictim?: GluvoDobaDeath | null;

  // kraj / ended
  winner?: GluvoDobaTeam;
  /** Winner is Morana specifically (team 'neutralci'). */
  moranaWon?: boolean;
  /** Lesnik survived to the end — wins alongside the winners. */
  lesnikSurvived?: { playerId: string; name: string };
  finalRoles?: GluvoDobaFinalRole[];
}

/** Per-player private slice, delivered via game:player-state only. */
export interface GluvoDobaControllerData {
  // Absent for someone who isn't part of this match (joined mid-game).
  roleId?: GluvoDobaRoleId;
  alive: boolean;

  // Dark team only: the whole pack knows each other; packPicks shows the
  // wolves' submitted kill votes tonight (live coordination).
  packMates?: { playerId: string; name: string }[];
  packPicks?: { name: string; targetName: string }[];
  // Vampir only: true once no Vukodlak is left alive — the Vampir has
  // inherited the pack and his own pick now decides the kill.
  vampirLeader?: boolean;

  // noc (living players)
  canAct?: boolean;
  hasActed?: boolean;
  // Pre-filtered on the server: no self; Zmaj minus last protected;
  // Vila minus last enchanted.
  targets?: GluvoDobaTargetOption[];
  /** Wolves, night 1 with the first-night-peace rule: picks are discarded. */
  peacefulNight?: boolean;
  /** Morana: whether tonight is one of her kill nights. */
  moranaKillTonight?: boolean;
  /** Zduhać: whether his one-time intercept is still unspent. */
  zduhacSaveAvailable?: boolean;

  /** Set at dawn if the Todorac trampled you last night. */
  blockedLastNight?: boolean;
  /** Set during glasanje if the Bauk scared you out of today's vote. */
  muted?: boolean;

  // Private investigation history — self-contained so a reconnect replays
  // everything the Vračara has learned so far.
  seerHistory?: { night: number; targetName: string; hintText: string }[];
  // Bajačica's private readings from the dead (da/ne tally per night;
  // blocked = the Todorac trampled her before she reached the other side).
  bajacicaHistory?: {
    night: number;
    targetName: string;
    da: number;
    ne: number;
    blocked?: boolean;
  }[];

  // Ghosts: the dead see everything.
  allRoles?: { name: string; roleId: GluvoDobaRoleId }[];
  // Ghosts answer the Bajačica's yes/no question about a living player.
  ghostQuestion?: { targetName: string } | null;
  hasGhostVoted?: boolean;

  // glasanje
  voteOptions?: GluvoDobaTargetOption[];
  hasVoted?: boolean;

  // Knez day power
  canKnezReveal?: boolean;

  // osveta (Suđaja only)
  isAvenger?: boolean;
  osvetaTargets?: GluvoDobaTargetOption[];
}
