import type { SpijunLocation } from '../types/spijun.js';

/**
 * Špijun location packs — an admin-curated set of locations (each with its
 * role list) that replaces the built-in bank for a session. Same trust model
 * as the other packs: the parser runs on disk reads, admin saves AND on the
 * client-supplied `spijunPack` in `host:start-game` (never trust the payload).
 */

export interface SpijunPack {
  name?: string;
  locations: SpijunLocation[];
}

/** A playable game needs enough locations for the spy-guess to be a puzzle. */
export const SPIJUN_MIN_LOCATIONS = 3;
export const SPIJUN_MAX_LOCATIONS = 60;
export const SPIJUN_MIN_ROLES = 2;
export const SPIJUN_MAX_ROLES = 12;
export const SPIJUN_MAX_LOCATION_LENGTH = 80;
export const SPIJUN_MAX_ROLE_LENGTH = 100;
export const SPIJUN_MAX_PACK_NAME_LENGTH = 60;

export type SpijunPackParseResult =
  | { ok: true; pack: SpijunPack }
  | { ok: false; error: string };

/**
 * Validate + normalize a raw pack object (from disk or a client payload).
 * `allowEmpty` (admin drafts) skips the min-locations floor so freshly
 * created packs can sit at 0 locations; game-side callers stay strict.
 */
export function parseSpijunPack(
  raw: unknown,
  opts: { allowEmpty?: boolean } = {}
): SpijunPackParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Pack mora biti objekat.' };
  }
  const obj = raw as Record<string, unknown>;

  let name: string | undefined;
  if (obj.name !== undefined && obj.name !== null && obj.name !== '') {
    if (typeof obj.name !== 'string') {
      return { ok: false, error: 'Naziv mora biti tekst.' };
    }
    name = obj.name.trim().slice(0, SPIJUN_MAX_PACK_NAME_LENGTH) || undefined;
  }

  if (!Array.isArray(obj.locations)) {
    return { ok: false, error: 'Polje "locations" mora biti niz.' };
  }
  if (!opts.allowEmpty && obj.locations.length < SPIJUN_MIN_LOCATIONS) {
    return {
      ok: false,
      error: `Pack mora imati bar ${SPIJUN_MIN_LOCATIONS} lokacije.`,
    };
  }
  if (obj.locations.length > SPIJUN_MAX_LOCATIONS) {
    return {
      ok: false,
      error: `Pack može imati najviše ${SPIJUN_MAX_LOCATIONS} lokacija.`,
    };
  }

  const locations: SpijunLocation[] = [];
  const seenNames = new Set<string>();
  for (let i = 0; i < obj.locations.length; i++) {
    const entry = obj.locations[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `Lokacija #${i + 1} mora biti objekat.` };
    }
    const loc = entry as Record<string, unknown>;

    if (typeof loc.location !== 'string' || !loc.location.trim()) {
      return { ok: false, error: `Lokacija #${i + 1}: nedostaje naziv.` };
    }
    const locationName = loc.location.trim();
    if (locationName.length > SPIJUN_MAX_LOCATION_LENGTH) {
      return {
        ok: false,
        error: `Lokacija #${i + 1}: naziv duži od ${SPIJUN_MAX_LOCATION_LENGTH} znakova.`,
      };
    }
    const key = locationName.toLowerCase();
    if (seenNames.has(key)) {
      return { ok: false, error: `Dupla lokacija: "${locationName}".` };
    }
    seenNames.add(key);

    if (!Array.isArray(loc.roles)) {
      return {
        ok: false,
        error: `Lokacija "${locationName}": polje "roles" mora biti niz.`,
      };
    }
    const roles: string[] = [];
    for (const r of loc.roles) {
      if (typeof r !== 'string' || !r.trim()) {
        return {
          ok: false,
          error: `Lokacija "${locationName}": svaka uloga mora biti neprazan tekst.`,
        };
      }
      const role = r.trim();
      if (role.length > SPIJUN_MAX_ROLE_LENGTH) {
        return {
          ok: false,
          error: `Lokacija "${locationName}": uloga duža od ${SPIJUN_MAX_ROLE_LENGTH} znakova.`,
        };
      }
      roles.push(role);
    }
    if (roles.length < SPIJUN_MIN_ROLES) {
      return {
        ok: false,
        error: `Lokacija "${locationName}": bar ${SPIJUN_MIN_ROLES} uloge.`,
      };
    }
    if (roles.length > SPIJUN_MAX_ROLES) {
      return {
        ok: false,
        error: `Lokacija "${locationName}": najviše ${SPIJUN_MAX_ROLES} uloga.`,
      };
    }

    locations.push({ location: locationName, roles });
  }

  return { ok: true, pack: name ? { name, locations } : { locations } };
}
