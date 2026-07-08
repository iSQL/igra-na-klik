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
 * Deal a pack's roster across the given players. `wolves` Vukodlak killers,
 * then every enabled special that fits (a random subset when there are more
 * specials than open slots — that's the pack's replayability), then Domaćini
 * fill the rest. The wolf count is clamped to leave at least one villager.
 */
export function dealRolesFromPack(
  playerIds: string[],
  pack: GluvoDobaPack
): Map<string, GluvoDobaRoleId> {
  const n = playerIds.length;
  const wolves = Math.max(1, Math.min(pack.wolves, n - 1));
  const slots = n - wolves;

  let specials = pack.roles.slice();
  if (specials.length > slots) specials = shuffled(specials).slice(0, slots);

  const deck: GluvoDobaRoleId[] = [
    ...Array<GluvoDobaRoleId>(wolves).fill('vukodlak'),
    ...specials,
  ];
  while (deck.length < n) deck.push('domacin');

  const ids = shuffled(playerIds);
  const dealt = shuffled(deck);
  const roles = new Map<string, GluvoDobaRoleId>();
  ids.forEach((id, i) => roles.set(id, dealt[i]));
  return roles;
}
