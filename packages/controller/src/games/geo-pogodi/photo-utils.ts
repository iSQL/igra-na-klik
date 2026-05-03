import exifr from 'exifr';
import { latLngToSvg } from '@igra/shared';
import type { GeoPin } from '@igra/shared';

export type GpsExtractionResult =
  | { kind: 'found'; pin: GeoPin; lat: number; lng: number }
  | { kind: 'no-gps' }
  | { kind: 'outside-serbia'; lat: number; lng: number }
  | { kind: 'error' };

/**
 * Reads the photo's EXIF GPS tags. Returns a structured result so the UI
 * can give the player explicit feedback about *why* a pin wasn't auto-placed.
 *
 *  - `found`: GPS within the Serbia bbox → pin pre-filled on the map.
 *  - `no-gps`: file has no GPS metadata (screenshot, edited photo, location
 *    services were off when the photo was taken).
 *  - `outside-serbia`: GPS exists but isn't in Serbia — player must place
 *    the pin manually.
 *  - `error`: parser failed unexpectedly.
 *
 * Bbox mirrors `parseGeoPackImport` so EXIF-derived pins and manually-placed
 * pins live in the same coordinate space.
 */
export async function extractGpsPin(file: File): Promise<GpsExtractionResult> {
  try {
    const gps = await exifr.gps(file);
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return { kind: 'no-gps' };
    }
    const { latitude, longitude } = gps;
    if (
      latitude < 41.5 ||
      latitude > 46.5 ||
      longitude < 18.5 ||
      longitude > 23.5
    ) {
      return { kind: 'outside-serbia', lat: latitude, lng: longitude };
    }
    const { x, y } = latLngToSvg(latitude, longitude);
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return { kind: 'outside-serbia', lat: latitude, lng: longitude };
    }
    return { kind: 'found', pin: { x, y }, lat: latitude, lng: longitude };
  } catch (err) {
    console.warn('GPS extraction failed:', err);
    return { kind: 'error' };
  }
}

/**
 * Downscales an image and re-encodes as JPEG so it fits comfortably within
 * the server's per-submission base64 cap (700 KB). A typical 4032×3024 phone
 * photo at JPEG q=0.7 lands around 200–400 KB after downscale to 1280px.
 *
 * Returns `null` if the file isn't a decodable image — the caller should
 * surface a friendly error.
 */
export async function downscaleImage(
  file: File,
  maxDim = 1280,
  quality = 0.7
): Promise<{ base64: string; bytes: number } | null> {
  const bitmap = await safeCreateImageBitmap(file);
  if (!bitmap) return null;

  const { width: srcW, height: srcH } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, dstW, dstH);
  bitmap.close?.();

  const base64 = canvas.toDataURL('image/jpeg', quality);
  return { base64, bytes: base64.length };
}

async function safeCreateImageBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Older Safari needs an <img> intermediary.
    return loadViaImg(file);
  }
}

function loadViaImg(file: File): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        const bmp = await createImageBitmap(img);
        URL.revokeObjectURL(url);
        resolve(bmp);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
