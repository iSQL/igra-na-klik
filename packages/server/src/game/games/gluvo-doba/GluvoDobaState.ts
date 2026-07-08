import type {
  GluvoDobaDeathCause,
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

  roles: Map<string, GluvoDobaRoleId>;
  alive: Set<string>;

  // --- night ---
  // actorId -> targetId, raw picks pre-redirect; one submission, final.
  nightActions: Map<string, string>;
  // Snapshot of living players at noc entry; pruned on permanent
  // disconnect so the phase can still early-exit.
  expectedActorIds: Set<string>;
  // Ghosts eligible to answer the Zduhać this night (snapshot of connected
  // dead at noc entry). Only gates early-exit while a question is pending.
  expectedGhostIds: Set<string>;
  ghostVotes: Map<string, 'da' | 'ne'>;
  // Set when the Zduhać submits — that's what pushes the question to ghosts.
  zduhacTargetId: string | null;
  lastProtectedId: string | null; // Zmaj no-repeat
  lastEnchantedId: string | null; // Vila no-repeat
  enchantedTonightId: string | null;

  // --- deaths / dawn ---
  pendingDeaths: GluvoDobaDeathRecord[];
  whisperTop: { name: string; count: number }[];

  // --- osveta ---
  osvetaContext: 'night' | 'lynch' | null;
  sudjajaId: string | null; // the avenger whose prompt is pending
  osvetaVictimId: string | null;

  // --- day vote ---
  dayVotes: Map<string, string>; // voterId -> targetId | 'skip'
  expectedVoterIds: Set<string>;
  lynchedId: string | null;
  lastVoteTally: { playerId: string; votes: number }[];
  lastSkipVotes: number;

  // --- private histories (survive reconnect via playerData) ---
  seerHistory: { night: number; targetName: string; hintText: string }[];
  zduhacHistory: {
    night: number;
    targetName: string;
    da: number;
    ne: number;
  }[];

  winner: GluvoDobaTeam | null;
}
