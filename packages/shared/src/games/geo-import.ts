import { SERBIAN_DISTRICTS } from '../types/geo-guess.js';
import type { GeoMapBBox, GeoPackMapDef, SerbianDistrict } from '../types/geo-guess.js';

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
  /**
   * Optional custom map (north-up mercator image + its geographic bbox).
   * When present, locations must fall inside the bbox; without it they must
   * fall inside Serbia's bounds and play on the bundled Serbia map.
   */
  map?: GeoPackMapDef;
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

// Custom-map bbox sanity limits: must sit on the (mercator-safe) globe and
// span something real but not continental — these maps are city/region scale.
const BBOX_ABS_LAT = 85;
const MAX_BBOX_SPAN_DEG = 20;
const MIN_BBOX_SPAN_DEG = 0.001;

type MapParse =
  | { ok: true; map?: GeoPackMapDef }
  | { ok: false; error: string };

function parseMapDef(raw: unknown): MapParse {
  if (raw === undefined || raw === null) return { ok: true, map: undefined };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '"map" mora biti objekat.' };
  }
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.imageFile)) {
    return { ok: false, error: '"map": nedostaje "imageFile".' };
  }
  const imageFile = (obj.imageFile as string).trim();
  if (imageFile.includes('..') || imageFile.includes('/') || imageFile.includes('\\')) {
    return { ok: false, error: '"map": nevažeća putanja slike.' };
  }
  const bboxRaw = obj.bbox as Record<string, unknown> | undefined;
  if (!bboxRaw || typeof bboxRaw !== 'object') {
    return { ok: false, error: '"map": nedostaje "bbox".' };
  }
  const nums: Partial<GeoMapBBox> = {};
  for (const key of ['minLat', 'maxLat', 'minLng', 'maxLng'] as const) {
    if (!isFiniteNumber(bboxRaw[key])) {
      return { ok: false, error: `"map.bbox": nedostaje broj "${key}".` };
    }
    nums[key] = bboxRaw[key] as number;
  }
  const bbox = nums as GeoMapBBox;
  if (Math.abs(bbox.minLat) > BBOX_ABS_LAT || Math.abs(bbox.maxLat) > BBOX_ABS_LAT) {
    return { ok: false, error: `"map.bbox": lat mora biti između -${BBOX_ABS_LAT} i ${BBOX_ABS_LAT}.` };
  }
  if (bbox.minLng < -180 || bbox.maxLng > 180) {
    return { ok: false, error: '"map.bbox": lng mora biti između -180 i 180.' };
  }
  const latSpan = bbox.maxLat - bbox.minLat;
  const lngSpan = bbox.maxLng - bbox.minLng;
  if (latSpan < MIN_BBOX_SPAN_DEG || lngSpan < MIN_BBOX_SPAN_DEG) {
    return { ok: false, error: '"map.bbox": min mora biti manji od max.' };
  }
  if (latSpan > MAX_BBOX_SPAN_DEG || lngSpan > MAX_BBOX_SPAN_DEG) {
    return { ok: false, error: `"map.bbox": raspon ne sme preći ${MAX_BBOX_SPAN_DEG}°.` };
  }
  return { ok: true, map: { imageFile, bbox } };
}

/**
 * Validates and normalizes a geo-pack manifest. Used by:
 *  - server `/api/geo-packs` listing endpoint (reject malformed packs);
 *  - server `geo-pack-resolver` on game start (authoritative re-check);
 *  - server admin editor, with `allowEmpty` so a freshly created pack can
 *    exist with zero locations (the strict game-side callers keep rejecting
 *    it, which is what keeps unfinished packs out of the in-game list).
 */
export function parseGeoPackImport(
  input: unknown,
  opts?: { allowEmpty?: boolean }
): GeoPackParseResult {
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
  const mapParsed = parseMapDef(raw.map);
  if (!mapParsed.ok) {
    return { ok: false, error: mapParsed.error };
  }
  const map = mapParsed.map;
  // With a custom map, locations must land on that map; otherwise they must
  // land on the bundled map of Serbia.
  const latMin = map ? map.bbox.minLat : MIN_LAT;
  const latMax = map ? map.bbox.maxLat : MAX_LAT;
  const lngMin = map ? map.bbox.minLng : MIN_LNG;
  const lngMax = map ? map.bbox.maxLng : MAX_LNG;

  if (!Array.isArray(raw.locations)) {
    return { ok: false, error: '"locations" mora biti niz.' };
  }
  const minLocations = opts?.allowEmpty ? 0 : MIN_LOCATIONS;
  if (
    raw.locations.length < minLocations ||
    raw.locations.length > MAX_LOCATIONS
  ) {
    return {
      ok: false,
      error: `"locations" mora imati između ${minLocations} i ${MAX_LOCATIONS} stavki.`,
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
    if (!isFiniteNumber(entry.lat) || entry.lat < latMin || entry.lat > latMax) {
      return {
        ok: false,
        error: `${label}: "lat" mora biti broj između ${latMin} i ${latMax}${map ? ' (bbox mape)' : ''}.`,
      };
    }
    if (!isFiniteNumber(entry.lng) || entry.lng < lngMin || entry.lng > lngMax) {
      return {
        ok: false,
        error: `${label}: "lng" mora biti broj između ${lngMin} i ${lngMax}${map ? ' (bbox mape)' : ''}.`,
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
      map,
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
