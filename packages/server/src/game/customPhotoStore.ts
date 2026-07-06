import { randomUUID } from 'crypto';

/**
 * In-memory store for player-uploaded photos (geo-pogodi / foto-kviz custom
 * modes). Photos used to travel inside the game state as base64 data URLs,
 * which meant every state broadcast re-sent them to every phone — up to
 * ~700KB per photo, once a second during a round. Instead the module stores
 * the decoded image here and puts a short `/api/custom-photos/...` URL in
 * the state; browsers fetch it once and cache it.
 *
 * Lifetime matches the game: modules call `clearRoomPhotos` from onEnd.
 */

interface StoredPhoto {
  mime: string;
  data: Buffer;
}

const photosByRoom = new Map<string, Map<string, StoredPhoto>>();

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

/**
 * Decodes and stores a base64 data URL. Returns the public URL path to put
 * in the game state, or null if the payload isn't a valid image data URL.
 */
export function storeCustomPhoto(
  roomCode: string,
  dataUrl: string
): string | null {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return null;

  let data: Buffer;
  try {
    data = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
  if (data.length === 0) return null;

  const id = randomUUID();
  let roomPhotos = photosByRoom.get(roomCode);
  if (!roomPhotos) {
    roomPhotos = new Map();
    photosByRoom.set(roomCode, roomPhotos);
  }
  roomPhotos.set(id, { mime: match[1], data });
  return `/api/custom-photos/${roomCode}/${id}`;
}

export function getCustomPhoto(
  roomCode: string,
  photoId: string
): StoredPhoto | undefined {
  return photosByRoom.get(roomCode)?.get(photoId);
}

/** Frees one photo by the URL previously returned from storeCustomPhoto. */
export function deleteCustomPhotoByUrl(roomCode: string, url: string): void {
  const roomPhotos = photosByRoom.get(roomCode);
  if (!roomPhotos) return;
  const id = url.slice(url.lastIndexOf('/') + 1);
  roomPhotos.delete(id);
  if (roomPhotos.size === 0) photosByRoom.delete(roomCode);
}

export function clearRoomPhotos(roomCode: string): void {
  photosByRoom.delete(roomCode);
}
