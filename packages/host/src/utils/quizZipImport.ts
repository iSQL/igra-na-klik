/**
 * Client-side unpacker for a Kviz pack `.zip` (as produced by /kviz-generator)
 * into an inline manifest suitable for the in-game importer.
 *
 * The in-game import path carries questions inline over the socket, so pack
 * assets are folded in as `data:` URLs: `imageFile` → `imageUrl` (data:image).
 * Audio and custom-map geo questions can't ride inline (audio data URLs blow
 * past the inline limits; maps need pack files) — those are rejected with a
 * message pointing at the admin "Podaci → Uvezi .zip" importer, which handles
 * full packs. Reads both STORE and DEFLATE zip entries.
 *
 * NOTE: duplicated verbatim in packages/controller (no shared client package) —
 * keep the two copies in sync.
 */

// Total inlined image budget, measured as the combined length of the base64
// data: URLs that actually ride the wire. The host:start-game socket message is
// capped at 512 KB, so keep the payload comfortably under that.
const MAX_INLINE_URL_CHARS = 460_000;

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: unknown }).DecompressionStream as
    | (new (fmt: string) => GenericTransformStream)
    | undefined;
  if (!DS) {
    throw new Error('Ovaj browser ne ume da otpakuje kompresovan .zip.');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DS('deflate-raw'));
  const ab = await new Response(stream as unknown as BodyInit).arrayBuffer();
  return new Uint8Array(ab);
}

async function readZip(u8: Uint8Array): Promise<ZipEntry[]> {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  const lo0 = Math.max(0, u8.length - 22 - 0xffff);
  for (let i = u8.length - 22; i >= lo0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Fajl nije validan .zip.');
  const count = dv.getUint16(eocd + 10, true);
  let cd = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(cd, true) !== 0x02014b50) throw new Error('Oštećen .zip.');
    const method = dv.getUint16(cd + 10, true);
    const csize = dv.getUint32(cd + 20, true);
    const nlen = dv.getUint16(cd + 28, true);
    const elen = dv.getUint16(cd + 30, true);
    const clen = dv.getUint16(cd + 32, true);
    const lo = dv.getUint32(cd + 42, true);
    const name = new TextDecoder().decode(u8.subarray(cd + 46, cd + 46 + nlen));
    cd += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const lnlen = dv.getUint16(lo + 26, true);
    const lelen = dv.getUint16(lo + 28, true);
    const start = lo + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    let data: Uint8Array;
    if (method === 0) data = new Uint8Array(raw);
    else if (method === 8) data = await inflateRaw(raw);
    else continue;
    out.push({ name, data });
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function imageMime(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const ext = m ? m[1].toLowerCase() : '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

export type QuizZipResult =
  | { ok: true; manifest: unknown }
  | { ok: false; error: string };

/**
 * Unpack a pack `.zip` (bytes) into an inline manifest object ready for
 * `parseQuizImport(..., { context: 'inline' })`. Images become data: URLs.
 */
export async function unpackQuizZip(bytes: Uint8Array): Promise<QuizZipResult> {
  let entries: ZipEntry[];
  try {
    entries = await readZip(bytes);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  let packJson: Uint8Array | null = null;
  const assets = new Map<string, Uint8Array>();
  for (const e of entries) {
    const base = e.name.split('/').pop() || e.name;
    if (e.name === 'pack.json' || base === 'pack.json') packJson = e.data;
    else if (e.name.startsWith('assets/')) assets.set(base, e.data);
  }
  if (!packJson) return { ok: false, error: 'U .zip-u nema pack.json.' };

  let manifest: Record<string, unknown>;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(packJson));
    manifest = Array.isArray(parsed) ? { questions: parsed } : parsed;
  } catch {
    return { ok: false, error: 'pack.json nije validan JSON.' };
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.questions)) {
    return { ok: false, error: 'pack.json nema listu pitanja.' };
  }
  // Custom maps reference pack files that can't ride inline — drop them.
  delete manifest.maps;

  let inlined = 0;
  for (const q of manifest.questions as Record<string, unknown>[]) {
    if (!q || typeof q !== 'object') continue;
    if (q.type === 'audio') {
      return {
        ok: false,
        error: 'Audio pitanja nisu podržana za uvoz u igri — koristi admin „Podaci → Uvezi .zip".',
      };
    }
    if (q.mapId) {
      return {
        ok: false,
        error: 'Geo pitanja sa custom mapom nisu podržana za uvoz u igri — koristi admin uvoz.',
      };
    }
    if (typeof q.imageFile === 'string') {
      const data = assets.get(q.imageFile);
      const mime = imageMime(q.imageFile);
      if (data && mime) {
        const url = `data:${mime};base64,${bytesToBase64(data)}`;
        inlined += url.length;
        if (inlined > MAX_INLINE_URL_CHARS) {
          return {
            ok: false,
            error: 'Pack ima previše/prevelike slike za uvoz u igri — koristi admin uvoz.',
          };
        }
        q.imageUrl = url;
      }
      delete q.imageFile;
    }
    delete q.audioFile;
  }

  return { ok: true, manifest };
}
