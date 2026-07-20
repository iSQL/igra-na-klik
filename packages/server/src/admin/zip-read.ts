import { inflateRawSync } from 'zlib';

/**
 * Minimal, dependency-free ZIP reader for the admin quiz-pack importer.
 * Parses the central directory (the authoritative index) and decompresses
 * STORE (0) and DEFLATE (8) entries — the two methods any normal zip tool
 * emits. Directory entries and other methods are skipped.
 *
 * We read zips produced by our own public generator (STORE) plus anything a
 * user re-zips with OS tools (usually DEFLATE); nothing here trusts entry
 * names for paths — the caller sanitizes those.
 */

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Locate the End Of Central Directory record by scanning backwards. */
function findEocd(buf: Buffer): number {
  // EOCD is 22 bytes + up to 65535 of comment; scan from the latest possible.
  const minPos = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * Decode every file entry in `buf`. Throws on a malformed/недостajući central
 * directory. Returns raw (still caller-sanitized) entry names + decoded bytes.
 */
export function readZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('Nije validan .zip fajl (nema EOCD zapisa).');

  const entryCount = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let n = 0; n < entryCount; n++) {
    if (cdOffset + 46 > buf.length || buf.readUInt32LE(cdOffset) !== CDIR_SIG) {
      throw new Error('Oštećen central directory u .zip fajlu.');
    }
    const method = buf.readUInt16LE(cdOffset + 10);
    const compSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf.toString('utf8', cdOffset + 46, cdOffset + 46 + nameLen);

    cdOffset += 46 + nameLen + extraLen + commentLen;

    // Skip directory markers.
    if (name.endsWith('/')) continue;

    // Read the local header to find where the data actually starts (its
    // name/extra lengths can differ from the central record's).
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error('Oštećen lokalni zapis u .zip fajlu.');
    }
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) throw new Error('Podaci u .zip fajlu su van granica.');
    const raw = buf.subarray(dataStart, dataEnd);

    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(raw);
    } else if (method === 8) {
      data = inflateRawSync(raw);
    } else {
      continue; // Unsupported compression — skip this entry.
    }
    entries.push({ name, data });
  }
  return entries;
}
