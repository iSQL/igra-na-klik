import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createHash, timingSafeEqual } from 'crypto';
import { mkdir, rename, writeFile } from 'fs/promises';

/**
 * Shared plumbing for the admin editors (geo, kviz, ko-sam-ja, tajni-agenti).
 * Everything under /api/admin is gated by the ADMIN_TOKEN env var via the
 * X-Admin-Token header; when the var is unset the whole API answers 403 so
 * a bare deployment can't be edited by strangers.
 */

export const PACK_ID_RE = /^[a-z0-9-]{1,40}$/;

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    res.status(403).json({
      error:
        'Admin editor nije omogućen — postavi ADMIN_TOKEN u .env i restartuj server.',
    });
    return;
  }
  // Constant-time comparison via fixed-length digests: a plain !== leaks
  // how many leading characters matched through response timing, and
  // timingSafeEqual alone throws on length mismatch (which itself leaks
  // the token's length).
  const provided = createHash('sha256')
    .update(req.header('x-admin-token') ?? '')
    .digest();
  const expected = createHash('sha256').update(configured).digest();
  if (!timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'Pogrešan admin token.' });
    return;
  }
  next();
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[čć]/g, 'c')
      .replace(/š/g, 's')
      .replace(/ž/g, 'z')
      .replace(/đ/g, 'dj')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'pack'
  );
}

/**
 * Write JSON atomically (tmp + rename) so a crash mid-write can't leave a
 * truncated file that would knock the pack out of both the game and the
 * editor. Creates the parent directory if needed.
 */
export async function writeJsonAtomic(
  filePath: string,
  data: unknown
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  await rename(tmp, filePath);
}

export const badId = (res: Response) =>
  res.status(400).json({ error: 'Nevažeći id packa (a-z, 0-9, crtica; max 40).' });
