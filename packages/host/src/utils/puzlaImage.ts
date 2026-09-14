import type { PuzlaUploadAck } from '@igra/shared';
import {
  PUZLA_CLIENT_TARGET_BYTES,
  PUZLA_MAX_ASPECT,
  PUZLA_MAX_IMAGE_EDGE,
} from '@igra/shared';
import { socket } from '../socket';

// Puzla picture: decode → downscale → JPEG under the byte budget → upload
// with an ack. The controller carries an identical copy (no shared DOM
// package) — keep the two in sync.
//
// Why re-encode instead of sending the file: a phone photo is several MB, and
// socket.io over long-polling base64-encodes binary (+33%); anything past the
// server's 512KB message cap kills the transport without an answer. Drawing
// through a canvas also applies EXIF orientation and flattens transparency.

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Fall through to <img> — some browsers refuse very large bitmaps.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function preparePuzlaImage(file: File): Promise<Blob> {
  let src: Decoded;
  try {
    src = await decode(file);
  } catch {
    throw new Error('Ovaj uređaj ne ume da pročita tu sliku — probaj JPG ili PNG.');
  }
  try {
    const aspect = src.width / src.height;
    if (!(aspect > 0) || aspect > PUZLA_MAX_ASPECT || aspect < 1 / PUZLA_MAX_ASPECT) {
      throw new Error('Slika je previše izdužena — izaberi nešto bliže kvadratu.');
    }
    let edge = PUZLA_MAX_IMAGE_EDGE;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, edge / Math.max(src.width, src.height));
      const w = Math.max(1, Math.round(src.width * scale));
      const h = Math.max(1, Math.round(src.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Slika nije mogla da se pripremi.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(src.source, 0, 0, w, h);
      for (const q of [0.86, 0.76, 0.66, 0.56]) {
        const blob = await toJpeg(canvas, q);
        if (blob && blob.type === 'image/jpeg' && blob.size <= PUZLA_CLIENT_TARGET_BYTES) {
          return blob;
        }
      }
      edge = Math.round(edge * 0.8);
    }
    throw new Error('Slika je prevelika — izaberi manju.');
  } finally {
    src.close();
  }
}

/** Prepare and upload; every failure comes back as a readable Serbian message. */
export async function uploadPuzlaImage(file: File): Promise<PuzlaUploadAck> {
  let blob: Blob;
  try {
    blob = await preparePuzlaImage(file);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error && err.message ? err.message : 'Slika nije mogla da se pročita.',
    };
  }
  const bytes = await blob.arrayBuffer();
  return new Promise((resolve) => {
    socket.timeout(20_000).emit('host:puzla-image', { bytes }, (err, res) => {
      if (err) resolve({ ok: false, error: 'Server nije odgovorio — pokušaj ponovo.' });
      else resolve(res);
    });
  });
}
