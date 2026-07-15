/**
 * Map/pin primitives shared by the Kviz geo question type.
 *
 * Coordinates use two systems and conversion happens via serbia-projection.ts:
 *  - Geographic {lat, lng} — authoritative truth, used for haversine distance.
 *  - Normalized {x, y} ∈ [0, 1] — what controllers tap and broadcast.
 *
 * The server projects controller pins → lat/lng before scoring, so pixel
 * differences across devices never affect results.
 */

/**
 * Geographic bounding box of a custom map image (north-up Web Mercator
 * export, e.g. from openstreetmap.org). Pins on such maps convert to
 * lat/lng through the mercator bbox math in serbia-projection.ts instead
 * of the calibrated Serbia projection.
 */
export interface GeoMapBBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Custom map for geo questions. `imageFile` lives inside the kviz pack's
 * asset folder and is served at /kviz-files/<pack>/<file>. When absent, a
 * geo question plays on the bundled map of Serbia.
 */
export interface GeoPackMapDef {
  imageFile: string;
  bbox: GeoMapBBox;
}

/** A pin location on the map, normalized to [0, 1] on each axis. */
export interface GeoPin {
  x: number;
  y: number;
}
