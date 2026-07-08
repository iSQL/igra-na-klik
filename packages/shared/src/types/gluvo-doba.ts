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
  | 'zmaj'
  | 'vidovnjak'
  | 'zduhac'
  | 'sudjaja'
  | 'vila'
  | 'domacin';

export type GluvoDobaTeam = 'vukodlaci' | 'selo';

export type GluvoDobaDeathCause = 'wolves' | 'osveta' | 'lynch' | 'disappeared';

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
  // Present only when REVEAL_ROLE_ON_DEATH is enabled.
  roleId?: GluvoDobaRoleId;
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
 * presuda tally. Anonymous aggregates (actedCount, whisper counts) only.
 */
export interface GluvoDobaHostData {
  day: number;
  players: GluvoDobaPlayerInfo[];

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
  finalRoles?: GluvoDobaFinalRole[];
}

/** Per-player private slice, delivered via game:player-state only. */
export interface GluvoDobaControllerData {
  // Absent for someone who isn't part of this match (joined mid-game).
  roleId?: GluvoDobaRoleId;
  alive: boolean;

  // Wolves only: who the packmates are, and their submitted picks tonight
  // (live coordination while choosing the victim).
  packMates?: { playerId: string; name: string }[];
  packPicks?: { name: string; targetName: string }[];

  // noc (living players)
  canAct?: boolean;
  hasActed?: boolean;
  // Pre-filtered on the server: no self; Zmaj minus last protected;
  // Vila minus last enchanted.
  targets?: GluvoDobaTargetOption[];

  // Private investigation histories — self-contained so a reconnect
  // replays everything the player has learned so far.
  seerHistory?: { night: number; targetName: string; hintText: string }[];
  zduhacHistory?: {
    night: number;
    targetName: string;
    da: number;
    ne: number;
  }[];

  // Ghosts: the dead see everything.
  allRoles?: { name: string; roleId: GluvoDobaRoleId }[];
  ghostQuestion?: { targetName: string } | null;
  hasGhostVoted?: boolean;

  // glasanje
  voteOptions?: GluvoDobaTargetOption[];
  hasVoted?: boolean;

  // osveta (Suđaja only)
  isAvenger?: boolean;
  osvetaTargets?: GluvoDobaTargetOption[];
}
