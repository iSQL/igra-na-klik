import type {
  GluvoDobaDeathCause,
  GluvoDobaDeathReveal,
  GluvoDobaPhase,
  GluvoDobaRoleId,
  GluvoDobaTeam,
} from '@igra/shared';

// Phase durations (seconds).
export const PODELA_ULOGA_DURATION = 15;
export const NOC_DURATION = 75;
export const OSVETA_DURATION = 25;
export const ZORA_DURATION = 15;
export const GLASANJE_DURATION = 60;
export const PRESUDA_DURATION = 12;
// Final role reveal lingers in its own phase — the moment we emit
// phase 'ended' the GameManager tears the game down and returns the room
// to the lobby, so 'kraj' is where everyone reads the role table.
export const KRAJ_DURATION = 30;

// Day-discussion timer (host-configurable, clamped server-side).
export const DEFAULT_DISCUSSION_DURATION = 180;
export const MIN_DISCUSSION_DURATION = 60;
export const MAX_DISCUSSION_DURATION = 300;

export interface GluvoDobaDeathRecord {
  playerId: string;
  cause: GluvoDobaDeathCause;
}

export interface GluvoDobaInternalState {
  phase: GluvoDobaPhase;
  phaseTimeRemaining: number;
  day: number; // 1-based, incremented when a night resolves into zora
  discussionDuration: number;

  // Host config.
  deathReveal: GluvoDobaDeathReveal;
  firstNightPeace: boolean;

  roles: Map<string, GluvoDobaRoleId>;
  alive: Set<string>;

  // --- night ---
  // actorId -> targetId, raw picks pre-block/redirect; one submission, final.
  nightActions: Map<string, string>;
  // Snapshot of living players at noc entry; pruned on permanent
  // disconnect so the phase can still early-exit.
  expectedActorIds: Set<string>;
  lastProtectedId: string | null; // Zmaj no-repeat
  lastEnchantedId: string | null; // Vila no-repeat
  enchantedTonightId: string | null;
  // The player the Todorac trampled last night (block survived Raskovnik) —
  // they get a private "pregažen si" flag through the following day.
  blockedLastNightId: string | null;

  // One-time Zduhać intercept.
  zduhacSaveUsed: boolean;
  // Set for the dawn where the save happened (public reveal), then cleared.
  zduhacSavedAnnouncement: { playerId: string } | null;
  // Bauk's victim — loses the vote on the day that follows the night.
  mutedTodayId: string | null;
  // Zora flavour for a bloodless configured first night.
  announcePeacefulFirstNight: boolean;

  // --- Bajačica / the dead's answer ---
  // The living player the Bajačica asked about tonight — set when she
  // submits, which is what pushes the yes/no question to the ghosts.
  bajacicaTargetId: string | null;
  ghostVotes: Map<string, 'da' | 'ne'>;
  // Snapshot of connected dead at noc entry — only gates early-exit while a
  // Bajačica question is pending.
  expectedGhostIds: Set<string>;

  // --- deaths / dawn ---
  pendingDeaths: GluvoDobaDeathRecord[];
  whisperTop: { name: string; count: number }[];

  // --- osveta ---
  osvetaContext: 'night' | 'lynch' | null;
  sudjajaId: string | null; // the avenger whose prompt is pending
  osvetaVictimId: string | null;

  // --- day ---
  knezRevealedId: string | null; // revealed Knez votes double, permanently
  dayVotes: Map<string, string>; // voterId -> targetId | 'skip'
  expectedVoterIds: Set<string>;
  lynchedId: string | null;
  lastVoteTally: { playerId: string; votes: number }[];
  lastSkipVotes: number;

  // --- private histories (survive reconnect via playerData) ---
  seerHistory: { night: number; targetName: string; hintText: string }[];
  bajacicaHistory: {
    night: number;
    targetName: string;
    da: number;
    ne: number;
    blocked?: boolean;
  }[];

  winner: GluvoDobaTeam | null;
  moranaWon: boolean;
}
