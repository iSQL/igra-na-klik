import { randomUUID } from 'crypto';
import {
  PUZLA_MAX_ASPECT,
  PUZLA_MAX_IMAGE_EDGE,
  PUZLA_MAX_UPLOAD_BYTES,
} from '@igra/shared';

/**
 * Puzla images live in memory, one per room, and die with the room.
 *
 * Deliberately not on disk: the picture is a host's private photo for one
 * evening, not content, so it has no business on the data volume, in backups
 * or in a factory reset — and `destroyRoom` (the single teardown path) is the
 * only cleanup it needs. A restart loses it, exactly like the room itself.
 */
export interface PuzlaStoredImage {
  /** Random per upload — the room code is three letters and easy to guess. */
  id: string;
  buf: Buffer;
  width: number;
  height: number;
  at: number;
}

export const PUZLA_IMAGE_ROUTE = '/puzla-slika';

/** Total bytes across all rooms before idle rooms' images get evicted. */
const BYTE_BUDGET = 32 * 1024 * 1024;

export function puzlaImageUrl(roomCode: string, id: string): string {
  return `${PUZLA_IMAGE_ROUTE}/${roomCode}/${id}`;
}

/**
 * Read width/height from a baseline or progressive JPEG's SOF marker. The
 * client's own claim about the size isn't trusted — the geometry depends on it.
 */
export function parseJpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    // Fill bytes.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / start of scan before any SOF
    const len = buf.readUInt16BE(i + 2);
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      if (i + 9 > buf.length) return null;
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

/** Validate an upload. Returns the parsed size, or a Serbian error for the UI. */
export function validatePuzlaJpeg(
  bytes: unknown
): { width: number; height: number } | { error: string } {
  if (!Buffer.isBuffer(bytes)) return { error: 'Slika nije stigla — pokušaj ponovo.' };
  if (bytes.length > PUZLA_MAX_UPLOAD_BYTES) {
    return { error: 'Slika je prevelika — izaberi manju.' };
  }
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { error: 'To nije slika koju igra ume da pročita.' };
  }
  const size = parseJpegSize(bytes);
  if (!size) return { error: 'To nije slika koju igra ume da pročita.' };
  // The client scales to PUZLA_MAX_IMAGE_EDGE; a little headroom for rounding.
  if (Math.max(size.width, size.height) > PUZLA_MAX_IMAGE_EDGE + 16) {
    return { error: 'Slika je prevelika — izaberi manju.' };
  }
  if (Math.min(size.width, size.height) < 64) {
    return { error: 'Slika je premala za slagalicu.' };
  }
  const aspect = size.width / size.height;
  if (aspect > PUZLA_MAX_ASPECT || aspect < 1 / PUZLA_MAX_ASPECT) {
    return { error: 'Slika je previše izdužena — izaberi nešto bliže kvadratu.' };
  }
  return size;
}

class PuzlaImageStore {
  private images = new Map<string, PuzlaStoredImage>();

  get(roomCode: string): PuzlaStoredImage | undefined {
    return this.images.get(roomCode);
  }

  /**
   * Store (or replace) a room's image. When the global budget is exceeded the
   * oldest images of rooms that aren't mid-game go first — never the one just
   * uploaded, and never one a running puzzle is drawing from.
   */
  put(
    roomCode: string,
    buf: Buffer,
    width: number,
    height: number,
    isBusy: (roomCode: string) => boolean
  ): PuzlaStoredImage {
    // Copy: socket.io may hand us a view into a larger pooled buffer.
    const image: PuzlaStoredImage = {
      id: randomUUID(),
      buf: Buffer.from(buf),
      width,
      height,
      at: Date.now(),
    };
    this.images.set(roomCode, image);

    let total = 0;
    for (const img of this.images.values()) total += img.buf.length;
    if (total > BYTE_BUDGET) {
      const evictable = [...this.images.entries()]
        .filter(([code]) => code !== roomCode && !isBusy(code))
        .sort((a, b) => a[1].at - b[1].at);
      for (const [code, img] of evictable) {
        if (total <= BYTE_BUDGET) break;
        this.images.delete(code);
        total -= img.buf.length;
      }
    }
    return image;
  }

  deleteRoom(roomCode: string): void {
    this.images.delete(roomCode);
  }
}

export const puzlaImages = new PuzlaImageStore();
