/**
 * Projection between geographic (lat, lng) coordinates over Serbia and
 * normalized map coordinates {x, y} ∈ [0, 1] over the bundled raster map
 * `packages/<host|controller>/src/games/geo-pogodi/assets/serbia-map.png`
 * (UN-style map, 1901×2386 px).
 *
 * Calibrated against the map's own graticule ticks (18°–23°E across the
 * top/bottom edges, 42°–46°N down the left/right edges), measured
 * programmatically from the pixels. The source map uses a conic-style
 * projection: parallels are horizontal and evenly spaced (latitude is
 * linear in y), but meridians converge toward the north — a degree of
 * longitude spans ~355 px along the top tick row vs ~385 px along the
 * bottom one. Longitude therefore maps through per-row linear coefficients
 * interpolated in y (a bilinear model with an exact closed-form inverse).
 * Residuals against the ticks and spot-checked cities are within a few
 * pixels (≈1–2 km) — far below the game's scoring granularity.
 *
 * Distance scoring uses haversine on the truth `{lat, lng}` vs. the pin
 * reprojected via `svgToLatLng`, so any small projection skew cancels
 * symmetrically and never advantages one player.
 *
 * If you swap the map image, re-measure the graticule and update the
 * calibration constants below plus MAP_W/MAP_H, then update the wrapper
 * dimensions in
 *   packages/host/src/games/geo-pogodi/components/SerbiaMap.tsx
 *   packages/controller/src/games/geo-pogodi/components/SerbiaMap.tsx
 * to keep the pin overlay aligned with the rendered map.
 */

// Approximate geographic bounds visible on the map (informational — the
// actual mapping uses the calibration constants below, not this box).
export const SERBIA_BBOX = {
  minLat: 41.74,
  maxLat: 46.37,
  minLng: 18.01,
  maxLng: 23.15,
} as const;

// Pixel dimensions of serbia-map.png. The exported name is kept from the
// old SVG-based map so downstream imports don't churn.
export const SVG_VIEWBOX = {
  width: 1901,
  height: 2386,
} as const;

const MAP_W = SVG_VIEWBOX.width;
const MAP_H = SVG_VIEWBOX.height;

// Latitude: parallels are horizontal and evenly spaced.
//   y_px(46°N) = 190.25, one degree of latitude = 514.875 px
// (left/right edge ticks for 45°/44°/43° land on this line within ±2 px).
const LAT_REF = 46;
const LAT_REF_Y = 190.25;
const PX_PER_LAT = 514.875;

// Longitude: least-squares fit x_px = A + B·lng along the top and bottom
// tick rows; coefficients are interpolated linearly in y between the rows.
const TOP_Y = 25;
const TOP_A = -6363.49;
const TOP_B = 355.329;
const BOT_Y = 2360;
const BOT_A = -6978.15;
const BOT_B = 385.3;

function lngCoeffsAt(yPx: number): { a: number; b: number } {
  const u = (yPx - TOP_Y) / (BOT_Y - TOP_Y);
  return {
    a: TOP_A + u * (BOT_A - TOP_A),
    b: TOP_B + u * (BOT_B - TOP_B),
  };
}

/** Convert geographic lat/lng to normalized map coords [0, 1]. */
export function latLngToSvg(
  lat: number,
  lng: number
): { x: number; y: number } {
  const yPx = LAT_REF_Y + (LAT_REF - lat) * PX_PER_LAT;
  const { a, b } = lngCoeffsAt(yPx);
  return { x: (a + b * lng) / MAP_W, y: yPx / MAP_H };
}

/** Inverse of latLngToSvg. */
export function svgToLatLng(
  x: number,
  y: number
): { lat: number; lng: number } {
  const yPx = y * MAP_H;
  const lat = LAT_REF - (yPx - LAT_REF_Y) / PX_PER_LAT;
  const { a, b } = lngCoeffsAt(yPx);
  return { lat, lng: (x * MAP_W - a) / b };
}

// ---------------------------------------------------------------------------
// Custom pack maps (north-up Web Mercator exports, e.g. openstreetmap.org).
//
// A pack may carry its own map image + geographic bbox. OSM exports use Web
// Mercator: longitude is linear in x, latitude maps through the mercator
// y-function — exact inverse below, so pins land precisely even though the
// bbox spans are tiny (city scale).
// ---------------------------------------------------------------------------

import type { GeoMapBBox, GeoPackMapDef } from '../types/geo-guess.js';

function mercatorY(latDeg: number): number {
  const phi = toRad(latDeg);
  return Math.log(Math.tan(Math.PI / 4 + phi / 2));
}

function inverseMercatorY(y: number): number {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

/** lat/lng → normalized [0, 1] on a mercator map image framed by bbox. */
export function bboxLatLngToXY(
  bbox: GeoMapBBox,
  lat: number,
  lng: number
): { x: number; y: number } {
  const yTop = mercatorY(bbox.maxLat);
  const yBot = mercatorY(bbox.minLat);
  return {
    x: (lng - bbox.minLng) / (bbox.maxLng - bbox.minLng),
    y: (yTop - mercatorY(lat)) / (yTop - yBot),
  };
}

/** Inverse of bboxLatLngToXY. */
export function bboxXYToLatLng(
  bbox: GeoMapBBox,
  x: number,
  y: number
): { lat: number; lng: number } {
  const yTop = mercatorY(bbox.maxLat);
  const yBot = mercatorY(bbox.minLat);
  return {
    lat: inverseMercatorY(yTop - y * (yTop - yBot)),
    lng: bbox.minLng + x * (bbox.maxLng - bbox.minLng),
  };
}

/**
 * Pack-aware pin conversions: custom map → mercator bbox math, no map →
 * the calibrated Serbia projection. Use these anywhere a pin meets a pack.
 */
export function packLatLngToPin(
  map: GeoPackMapDef | undefined,
  lat: number,
  lng: number
): { x: number; y: number } {
  return map ? bboxLatLngToXY(map.bbox, lat, lng) : latLngToSvg(lat, lng);
}

export function packPinToLatLng(
  map: GeoPackMapDef | undefined,
  x: number,
  y: number
): { lat: number; lng: number } {
  return map ? bboxXYToLatLng(map.bbox, x, y) : svgToLatLng(x, y);
}

/** Corner-to-corner distance of a bbox — used to scale distance scoring. */
export function bboxDiagonalKm(bbox: GeoMapBBox): number {
  return haversineKm(
    { lat: bbox.minLat, lng: bbox.minLng },
    { lat: bbox.maxLat, lng: bbox.maxLng }
  );
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
