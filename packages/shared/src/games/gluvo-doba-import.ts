import type { GluvoDobaRoleId } from '../types/gluvo-doba.js';
import { GLUVO_DOBA_ROLES } from './gluvo-doba-roles.js';
import { shuffled } from '../utils/shuffle.js';

/**
 * Gluvo doba "packs" (modes) — a named role set an admin curates. A pack
 * fixes the wolf count and checks on a set of special roles; when a pack is
 * selected it fully determines the roster (the built-in count-based bands
 * and the neutral/vila/bajačica toggles are bypassed). Rules that aren't
 * about the roster — death reveal, peaceful first night, discussion timer —
 * still apply on top.
 */

export interface GluvoDobaPack {
  name?: string;
  /** Number of plain Vukodlak killers (dark specials are separate roles). */
  wolves: number;
  /** Enabled special roles (never 'vukodlak' — that's the count — nor the
   *  filler 'domacin'). */
  roles: GluvoDobaRoleId[];
}

export const GLUVO_DOBA_MIN_WOLVES = 1;
export const GLUVO_DOBA_MAX_WOLVES = 6;

/**
 * Every role a pack may toggle: all of them except the wolf (a count) and
 * the Domaćin (the automatic filler). Order here is the editor's display
 * order (dark → village → neutral).
 */
export const GLUVO_DOBA_PACK_ROLE_IDS: GluvoDobaRoleId[] = [
  'vampir',
  'todorac',
  'drekavac',
  'bauk',
  'vidovnjak',
  'zmaj',
  'sudjaja',
  'knez',
  'raskovnik',
  'zduhac',
  'bajacica',
  'vila',
  'lesnik',
  'morana',
];

const PACK_ROLE_SET = new Set<GluvoDobaRoleId>(GLUVO_DOBA_PACK_ROLE_IDS);

export type GluvoDobaPackParseResult =
  | { ok: true; pack: GluvoDobaPack }
  | { ok: false; error: string };

/**
 * Validate + normalize a raw pack object (from disk or a client payload).
 * Lax on ordering/dedup; strict on the wolf count and role identities.
 */
export function parseGluvoDobaPack(raw: unknown): GluvoDobaPackParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Pack mora biti objekat.' };
  }
  const obj = raw as Record<string, unknown>;

  let name: string | undefined;
  if (obj.name !== undefined && obj.name !== null && obj.name !== '') {
    if (typeof obj.name !== 'string') {
      return { ok: false, error: 'Naziv mora biti tekst.' };
    }
    name = obj.name.trim() || undefined;
  }

  if (
    typeof obj.wolves !== 'number' ||
    !Number.isFinite(obj.wolves) ||
    !Number.isInteger(obj.wolves)
  ) {
    return { ok: false, error: 'Broj vukova mora biti ceo broj.' };
  }
  if (obj.wolves < GLUVO_DOBA_MIN_WOLVES || obj.wolves > GLUVO_DOBA_MAX_WOLVES) {
    return {
      ok: false,
      error: `Broj vukova mora biti između ${GLUVO_DOBA_MIN_WOLVES} i ${GLUVO_DOBA_MAX_WOLVES}.`,
    };
  }

  if (!Array.isArray(obj.roles)) {
    return { ok: false, error: 'Polje "roles" mora biti niz.' };
  }
  const roles: GluvoDobaRoleId[] = [];
  const seen = new Set<GluvoDobaRoleId>();
  for (const r of obj.roles) {
    if (typeof r !== 'string' || !PACK_ROLE_SET.has(r as GluvoDobaRoleId)) {
      return { ok: false, error: `Nepoznata ili nedozvoljena uloga: ${String(r)}.` };
    }
    const id = r as GluvoDobaRoleId;
    if (seen.has(id)) continue;
    seen.add(id);
    roles.push(id);
  }

  return { ok: true, pack: name ? { name, wolves: obj.wolves, roles } : { wolves: obj.wolves, roles } };
}

/**
 * The "threat budget" for a player count — how many non-village seats
 * (dark + neutral combined) a balanced game gets. Mirrors the built-in
 * bands so a pack deal stays as fair as `compositionFor`: 6–8 → 2,
 * 9–12 → 3, 13–15 → 4 (≈ a quarter to a third of the table). The village
 * always keeps the rest, so it can never be out-numbered on night one.
 */
export function threatBudgetFor(playerCount: number): number {
  if (playerCount <= 8) return 2;
  if (playerCount <= 12) return 3;
  return 4;
}

function randInt(maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive + 1));
}

/**
 * Deal a pack's roster across the given players — **balanced by player
 * count**, so enabling every role ("haos mod") can't hand the dark side a
 * majority. The non-village seats are fixed by `threatBudgetFor(n)` and
 * split between the Sile Mraka and (optionally) a neutral or two; the
 * remaining `n − budget` seats are always villagers. Within each team the
 * exact specials are picked at random from what the pack enables (that's the
 * replayability). The village can therefore never be out-numbered at start.
 *
 *  - Neutrals (Lesnik/Morana) count against the threat budget, not the
 *    village — so adding one trades a dark seat, keeping the village size
 *    steady (e.g. 6 players → 4 villagers + either 2 dark, or 1 dark + 1
 *    neutral). At most 1 neutral below 13 players, 2 at 13+, and never all
 *    of the budget (there's always ≥ 1 actual wolf).
 *  - `pack.wolves` is honored up to the dark budget; if the pack enables
 *    fewer dark specials than the budget wants, extra Vukodlaci fill the gap.
 */
export function dealRolesFromPack(
  playerIds: string[],
  pack: GluvoDobaPack
): Map<string, GluvoDobaRoleId> {
  const n = playerIds.length;

  // Split the pack's enabled specials by team (wolf + domacin are never in
  // pack.roles, so these three pools cover everything the pack can add).
  const darkPool = shuffled(
    pack.roles.filter((r) => GLUVO_DOBA_ROLES[r].team === 'vukodlaci')
  );
  const neutralPool = shuffled(
    pack.roles.filter((r) => GLUVO_DOBA_ROLES[r].team === 'neutralci')
  );
  const villagePool = shuffled(
    pack.roles.filter((r) => GLUVO_DOBA_ROLES[r].team === 'selo')
  );

  const budget = Math.min(threatBudgetFor(n), n - 1);

  // Neutrals consume threat slots (never the whole budget — the dark side
  // must keep at least one wolf). 0..cap chosen at random for variety.
  const neutralCap = Math.min(
    neutralPool.length,
    n >= 13 ? 2 : 1,
    Math.max(0, budget - 1)
  );
  const neutralCount = randInt(neutralCap);
  const neutrals = neutralPool.slice(0, neutralCount);

  // The rest of the budget is the dark side: at least one wolf, then dark
  // specials; if the pack lacks enough dark specials, more wolves fill in.
  const darkCount = budget - neutralCount;
  const wantWolves = Math.max(1, Math.min(pack.wolves, darkCount));
  const darkSpecials = darkPool.slice(0, darkCount - wantWolves);
  const wolves = darkCount - darkSpecials.length;

  const deck: GluvoDobaRoleId[] = [
    ...Array<GluvoDobaRoleId>(wolves).fill('vukodlak'),
    ...darkSpecials,
    ...neutrals,
  ];

  // Everything left is the village: enabled village specials first, then
  // plain Domaćini fill any remainder.
  const villageSlots = n - deck.length;
  deck.push(...villagePool.slice(0, Math.max(0, villageSlots)));
  while (deck.length < n) deck.push('domacin');

  const ids = shuffled(playerIds);
  const dealt = shuffled(deck.slice(0, n));
  const roles = new Map<string, GluvoDobaRoleId>();
  ids.forEach((id, i) => roles.set(id, dealt[i]));
  return roles;
}
