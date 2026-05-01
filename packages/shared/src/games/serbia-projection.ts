/**
 * Affine projection between geographic (lat, lng) coordinates over Serbia and
 * normalized SVG coordinates {x, y} ∈ [0, 1] inside the
 * `packages/host/src/games/geo-pogodi/assets/serbia.svg` viewBox.
 *
 * The constants below match Wikipedia's Module:Location_map/data/Serbia,
 * which is the convention the bundled `serbia.svg` (from Wikimedia Commons,
 * `Serbia_adm_location_map.svg`) follows. The SVG uses an equirectangular
 * projection with 140% vertical stretching — that stretch only affects the
 * rendered aspect ratio, not the underlying linear mapping, so the
 * normalized [0, 1] mapping remains a simple bbox-relative affine fit.
 *
 * Distance scoring uses haversine on the truth `{lat, lng}` vs. the pin
 * reprojected via `svgToLatLng`, so any small projection skew cancels
 * symmetrically and never advantages one player.
 *
 * If you swap the SVG, update SERBIA_BBOX and SVG_VIEWBOX to match the new
 * file's bounds and dimensions, then update the wrapper `aspectRatio` in
 *   packages/host/src/games/geo-pogodi/components/SerbiaMap.tsx
 *   packages/controller/src/games/geo-pogodi/components/SerbiaMap.tsx
 * to keep the pin overlay aligned with the rendered map.
 */

// From Wikipedia's Module:Location_map/data/Serbia
//   top=46.3, bottom=41.7, left=18.7, right=23.2
export const SERBIA_BBOX = {
  minLat: 41.7,
  maxLat: 46.3,
  minLng: 18.7,
  maxLng: 23.2,
} as const;

// Matches `Serbia_adm_location_map.svg` from Wikimedia Commons.
export const SVG_VIEWBOX = {
  width: 724.531,
  height: 1036.962,
} as const;

// Linear constants derived from SERBIA_BBOX (so {minLng, minLat} → (0,1) and
// {maxLng, maxLat} → (1,0), with y inverted because SVG y grows downward).
const LNG_SPAN = SERBIA_BBOX.maxLng - SERBIA_BBOX.minLng;
const LAT_SPAN = SERBIA_BBOX.maxLat - SERBIA_BBOX.minLat;

/** Convert geographic lat/lng to normalized SVG coords [0, 1]. */
export function latLngToSvg(
  lat: number,
  lng: number
): { x: number; y: number } {
  const x = (lng - SERBIA_BBOX.minLng) / LNG_SPAN;
  const y = 1 - (lat - SERBIA_BBOX.minLat) / LAT_SPAN;
  return { x, y };
}

/** Inverse of latLngToSvg. */
export function svgToLatLng(
  x: number,
  y: number
): { lat: number; lng: number } {
  const lng = SERBIA_BBOX.minLng + x * LNG_SPAN;
  const lat = SERBIA_BBOX.minLat + (1 - y) * LAT_SPAN;
  return { lat, lng };
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometers. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
