import { SERBIAN_DISTRICTS } from '../types/geo-guess.js';
import type { SerbianDistrict } from '../types/geo-guess.js';

/**
 * Wire format for an entry inside a geo-pack manifest JSON file.
 * `imageFile` is resolved by the server to a `/geo-images/<pack>/<file>` URL.
 */
export interface GeoLocationImport {
  imageFile: string;
  lat: number;
  lng: number;
  district?: SerbianDistrict;
  caption?: string;
}

export interface GeoPackManifest {
  name: string;
  description?: string;
  locations: GeoLocationImport[];
}

export type GeoPackParseResult =
  | { ok: true; manifest: GeoPackManifest }
  | { ok: false; error: string };

const MIN_LOCATIONS = 1;
const MAX_LOCATIONS = 100;
const MIN_LAT = 41.5;
const MAX_LAT = 46.5;
const MIN_LNG = 18.5;
const MAX_LNG = 23.5;
const MAX_CAPTION_LENGTH = 200;
const DISTRICT_SET = new Set<string>(SERBIAN_DISTRICTS);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validates and normalizes a geo-pack manifest. Used by:
 *  - server `/api/geo-packs` listing endpoint (reject malformed packs);
 *  - server `geo-pack-resolver` on game start (authoritative re-check).
 */
export function parseGeoPackImport(input: unknown): GeoPackParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Manifest mora biti objekat.' };
  }
  const raw = input as Record<string, unknown>;

  if (!isNonEmptyString(raw.name)) {
    return { ok: false, error: 'Nedostaje "name".' };
  }
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    return { ok: false, error: '"description" mora biti string.' };
  }
  if (!Array.isArray(raw.locations)) {
    return { ok: false, error: '"locations" mora biti niz.' };
  }
  if (
    raw.locations.length < MIN_LOCATIONS ||
    raw.locations.length > MAX_LOCATIONS
  ) {
    return {
      ok: false,
      error: `"locations" mora imati između ${MIN_LOCATIONS} i ${MAX_LOCATIONS} stavki.`,
    };
  }

  const locations: GeoLocationImport[] = [];
  for (let i = 0; i < raw.locations.length; i++) {
    const entry = raw.locations[i] as Record<string, unknown> | undefined;
    const label = `Lokacija ${i + 1}`;

    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: `${label}: nije objekat.` };
    }
    if (!isNonEmptyString(entry.imageFile)) {
      return { ok: false, error: `${label}: nedostaje "imageFile".` };
    }
    if ((entry.imageFile as string).includes('..')) {
      return { ok: false, error: `${label}: putanja ne sme sadržati "..".` };
    }
    if (!isFiniteNumber(entry.lat) || entry.lat < MIN_LAT || entry.lat > MAX_LAT) {
      return {
        ok: false,
        error: `${label}: "lat" mora biti broj između ${MIN_LAT} i ${MAX_LAT}.`,
      };
    }
    if (!isFiniteNumber(entry.lng) || entry.lng < MIN_LNG || entry.lng > MAX_LNG) {
      return {
        ok: false,
        error: `${label}: "lng" mora biti broj između ${MIN_LNG} i ${MAX_LNG}.`,
      };
    }
    let district: SerbianDistrict | undefined;
    if (entry.district !== undefined) {
      if (typeof entry.district !== 'string' || !DISTRICT_SET.has(entry.district)) {
        return {
          ok: false,
          error: `${label}: nepoznat okrug "${String(entry.district)}".`,
        };
      }
      district = entry.district as SerbianDistrict;
    }
    let caption: string | undefined;
    if (entry.caption !== undefined) {
      if (typeof entry.caption !== 'string') {
        return { ok: false, error: `${label}: "caption" mora biti string.` };
      }
      if (entry.caption.length > MAX_CAPTION_LENGTH) {
        return {
          ok: false,
          error: `${label}: "caption" predugačak (max ${MAX_CAPTION_LENGTH} znakova).`,
        };
      }
      caption = entry.caption;
    }

    locations.push({
      imageFile: (entry.imageFile as string).trim(),
      lat: entry.lat,
      lng: entry.lng,
      district,
      caption,
    });
  }

  return {
    ok: true,
    manifest: {
      name: (raw.name as string).trim(),
      description:
        typeof raw.description === 'string' ? raw.description.trim() : undefined,
      locations,
    },
  };
}

/**
 * Wire format for a custom-mode photo submission.
 * The server projects `pin` → lat/lng on receipt and stores the result.
 */
export interface CustomGeoPhotoSubmission {
  imageBase64: string;
  pin: { x: number; y: number };
  caption?: string;
}

export const MAX_BASE64_BYTES = 700_000;
export const MAX_CUSTOM_CAPTION_LENGTH = 80;

export type CustomGeoSubmissionResult =
  | { ok: true; submission: CustomGeoPhotoSubmission }
  | { ok: false; error: string };

/**
 * Validates a single incoming photo from a controller in custom mode.
 * - Caps the base64 payload (post-downscale should easily fit).
 * - Pin must be in [0, 1].
 * - Caption is optional and clipped to MAX_CUSTOM_CAPTION_LENGTH.
 */
export function parseCustomPhotoSubmission(
  input: unknown
): CustomGeoSubmissionResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Slika nije validna.' };
  }
  const raw = input as Record<string, unknown>;

  if (!isNonEmptyString(raw.imageBase64)) {
    return { ok: false, error: 'Nedostaje slika.' };
  }
  const b64 = (raw.imageBase64 as string).trim();
  if (!b64.startsWith('data:image/')) {
    return { ok: false, error: 'Nevažeći format slike.' };
  }
  if (b64.length > MAX_BASE64_BYTES) {
    return { ok: false, error: 'Slika je prevelika nakon kompresije.' };
  }

  const pin = raw.pin as { x?: unknown; y?: unknown } | undefined;
  if (!pin || !isFiniteNumber(pin.x) || !isFiniteNumber(pin.y)) {
    return { ok: false, error: 'Pin nije postavljen.' };
  }
  if (pin.x < 0 || pin.x > 1 || pin.y < 0 || pin.y > 1) {
    return { ok: false, error: 'Pin van mape.' };
  }

  let caption: string | undefined;
  if (raw.caption !== undefined) {
    if (typeof raw.caption !== 'string') {
      return { ok: false, error: '"caption" mora biti string.' };
    }
    caption = raw.caption.trim().slice(0, MAX_CUSTOM_CAPTION_LENGTH);
    if (caption.length === 0) caption = undefined;
  }

  return {
    ok: true,
    submission: {
      imageBase64: b64,
      pin: { x: pin.x, y: pin.y },
      caption,
    },
  };
}
