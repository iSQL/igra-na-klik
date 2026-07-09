import { Router } from 'express';
import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'fs/promises';
import type { Dirent } from 'fs';
import { parsePogodiBrojImport } from '@igra/shared';
import type {
  PogodiBrojPackManifest,
  PogodiBrojQuestion,
  PogodiBrojValueType,
} from '@igra/shared';
import {
  PACK_ID_RE,
  requireAdmin,
  slugify,
  writeJsonAtomic,
  badId,
} from './admin-common.js';

/**
 * Admin CRUD API for "Pogodi broj" question packs.
 *
 * The editor page at /admin/pogodi-broj talks to these routes. Everything is
 * protected by ADMIN_TOKEN via the X-Admin-Token header (see requireAdmin);
 * when the var is unset the whole API answers 403.
 *
 * Modeled on geo-admin: images ride inside JSON as base64 and are written as
 * <uuid>.jpg into a per-pack folder served at /pogodi-images/<id>/<file>.
 * Question numeric fields are validated through the shared strict parser on
 * every write; drafts (0 questions) are allowed so a freshly created pack can
 * exist before it's filled.
 */

const MAX_IMAGE_BASE64 = 8_000_000; // ~6 MB binary after decode
const VALUE_TYPES = new Set<PogodiBrojValueType>(['number', 'duration']);

interface AdminQuestion extends PogodiBrojQuestion {
  imageUrl?: string;
}

interface AdminPack {
  id: string;
  name: string;
  description?: string;
  questions: AdminQuestion[];
  /** True when the pack passes the strict (non-empty) in-game validation. */
  visibleInGame: boolean;
  error?: string;
}

export function createPogodiBrojAdminRouter(packsDir: string): Router {
  const router = Router();

  // Image uploads ride inside JSON as base64 → larger body cap than the app.
  router.use(express.json({ limit: '10mb' }));
  router.use(requireAdmin);

  const manifestPath = (id: string) => path.join(packsDir, `${id}.json`);
  const imagesDir = (id: string) => path.join(packsDir, id);

  async function readManifestLax(
    id: string
  ): Promise<PogodiBrojPackManifest | null> {
    let raw: string;
    try {
      raw = await readFile(manifestPath(id), 'utf-8');
    } catch {
      return null;
    }
    try {
      const parsed = parsePogodiBrojImport(JSON.parse(raw), { allowEmpty: true });
      return parsed.ok ? parsed.manifest : null;
    } catch {
      return null;
    }
  }

  /** Validate the draft shape (allowEmpty) and write atomically. */
  async function writeManifest(
    id: string,
    manifest: PogodiBrojPackManifest
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const check = parsePogodiBrojImport(manifest, { allowEmpty: true });
    if (!check.ok) return { ok: false, error: check.error };
    await writeJsonAtomic(manifestPath(id), check.manifest);
    return { ok: true };
  }

  function toAdminPack(id: string, manifest: PogodiBrojPackManifest): AdminPack {
    // Strict check mirrors the in-game validator so the page can warn that a
    // draft pack won't show up until it has at least one question.
    const strict = parsePogodiBrojImport(manifest);
    return {
      id,
      name: manifest.name,
      description: manifest.description,
      questions: manifest.questions.map((q) => ({
        ...q,
        imageUrl: q.imageFile
          ? `/pogodi-images/${id}/${q.imageFile}`
          : undefined,
      })),
      visibleInGame: strict.ok,
      error: strict.ok ? undefined : strict.error,
    };
  }

  /** Coerce/validate the numeric + string fields of one question from a body. */
  function parseQuestion(
    body: Record<string, unknown>,
    imageFile?: string
  ): { ok: true; question: PogodiBrojQuestion } | { ok: false; error: string } {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return { ok: false, error: 'Nedostaje tekst pitanja.' };

    const answer = Number(body.answer);
    const min = Number(body.min);
    const max = Number(body.max);
    if (![answer, min, max].every(Number.isFinite)) {
      return { ok: false, error: 'Odgovor, min i max moraju biti brojevi.' };
    }
    if (min >= max) return { ok: false, error: 'Min mora biti manji od max.' };
    if (answer < min || answer > max) {
      return { ok: false, error: 'Odgovor mora biti između min i max.' };
    }

    let step: number | undefined;
    if (body.step !== undefined && body.step !== null && body.step !== '') {
      const s = Number(body.step);
      if (!Number.isFinite(s) || s <= 0) {
        return { ok: false, error: 'Korak mora biti pozitivan broj.' };
      }
      if (s > max - min) return { ok: false, error: 'Korak je veći od raspona.' };
      step = s;
    }

    let unit: string | undefined;
    if (typeof body.unit === 'string' && body.unit.trim().length > 0) {
      unit = body.unit.trim();
    }

    let valueType: PogodiBrojValueType | undefined;
    if (typeof body.valueType === 'string' && body.valueType !== 'number') {
      if (!VALUE_TYPES.has(body.valueType as PogodiBrojValueType)) {
        return { ok: false, error: 'Nepoznat tip vrednosti.' };
      }
      valueType = body.valueType as PogodiBrojValueType;
    }

    let emoji: string | undefined;
    if (typeof body.emoji === 'string' && body.emoji.trim().length > 0) {
      emoji = body.emoji.trim();
    }

    return {
      ok: true,
      question: { text, answer, min, max, step, unit, valueType, emoji, imageFile },
    };
  }

  /** Decode a data:image/...;base64 payload and write it as <uuid>.<ext>. */
  async function saveImage(
    packId: string,
    imageBase64: unknown
  ): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
    if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      return { ok: false, error: 'Nedostaje slika.' };
    }
    if (imageBase64.length > MAX_IMAGE_BASE64) {
      return { ok: false, error: 'Slika je prevelika (max ~6 MB).' };
    }
    const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(
      imageBase64
    );
    if (!match) return { ok: false, error: 'Nevažeći format slike.' };
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    let data: Buffer;
    try {
      data = Buffer.from(match[2], 'base64');
    } catch {
      return { ok: false, error: 'Neispravan base64 sadržaj.' };
    }
    if (data.length === 0) return { ok: false, error: 'Prazna slika.' };
    const fileName = `${randomUUID()}.${ext}`;
    await mkdir(imagesDir(packId), { recursive: true });
    await writeFile(path.join(imagesDir(packId), fileName), data);
    return { ok: true, fileName };
  }

  async function deleteImageQuiet(packId: string, fileName?: string) {
    if (!fileName) return;
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\'))
      return;
    try {
      await unlink(path.join(imagesDir(packId), fileName));
    } catch {
      // Already gone — fine.
    }
  }

  // ---- Pack list (full contents, including drafts) ------------------------

  router.get('/pogodi-broj-packs', async (_req, res) => {
    let entries: Dirent[];
    try {
      entries = await readdir(packsDir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        res.json({ packs: [] });
        return;
      }
      console.error('pogodi-broj-admin: failed to read packs dir:', err);
      res.status(500).json({ error: 'Ne mogu da pročitam pogodi-broj folder.' });
      return;
    }
    const packs: AdminPack[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
      const id = entry.name.replace(/\.json$/i, '');
      if (!PACK_ID_RE.test(id)) continue;
      const manifest = await readManifestLax(id);
      if (manifest) packs.push(toAdminPack(id, manifest));
    }
    packs.sort((a, b) => a.id.localeCompare(b.id));
    res.json({ packs });
  });

  // ---- Create pack ---------------------------------------------------------

  router.post('/pogodi-broj-packs', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'Nedostaje naziv packa.' });
      return;
    }
    const description =
      typeof body.description === 'string' && body.description.trim().length > 0
        ? body.description.trim()
        : undefined;

    const id =
      typeof body.id === 'string' && body.id.trim().length > 0
        ? body.id.trim()
        : slugify(name);
    if (!PACK_ID_RE.test(id)) {
      badId(res);
      return;
    }
    if (await readManifestLax(id)) {
      res.status(409).json({ error: `Pack "${id}" već postoji.` });
      return;
    }

    const manifest: PogodiBrojPackManifest = { name, description, questions: [] };
    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      res.status(400).json({ error: written.error });
      return;
    }
    res.status(201).json({ pack: toAdminPack(id, manifest) });
  });

  // ---- Update pack metadata ------------------------------------------------

  router.patch('/pogodi-broj-packs/:id', async (req, res) => {
    const id = req.params.id;
    if (!PACK_ID_RE.test(id)) {
      badId(res);
      return;
    }
    const manifest = await readManifestLax(id);
    if (!manifest) {
      res.status(404).json({ error: 'Pack ne postoji.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.name === 'string' && body.name.trim().length > 0) {
      manifest.name = body.name.trim();
    }
    if (body.description !== undefined) {
      manifest.description =
        typeof body.description === 'string' && body.description.trim().length > 0
          ? body.description.trim()
          : undefined;
    }
    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      res.status(400).json({ error: written.error });
      return;
    }
    res.json({ pack: toAdminPack(id, manifest) });
  });

  // ---- Delete pack ----------------------------------------------------------

  router.delete('/pogodi-broj-packs/:id', async (req, res) => {
    const id = req.params.id;
    if (!PACK_ID_RE.test(id)) {
      badId(res);
      return;
    }
    try {
      await unlink(manifestPath(id));
    } catch {
      res.status(404).json({ error: 'Pack ne postoji.' });
      return;
    }
    await rm(imagesDir(id), { recursive: true, force: true });
    res.json({ ok: true });
  });

  // ---- Add question ---------------------------------------------------------

  router.post('/pogodi-broj-packs/:id/questions', async (req, res) => {
    const id = req.params.id;
    if (!PACK_ID_RE.test(id)) {
      badId(res);
      return;
    }
    const manifest = await readManifestLax(id);
    if (!manifest) {
      res.status(404).json({ error: 'Pack ne postoji.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;

    let imageFile: string | undefined;
    if (body.imageBase64 !== undefined && body.imageBase64 !== null) {
      const image = await saveImage(id, body.imageBase64);
      if (!image.ok) {
        res.status(400).json({ error: image.error });
        return;
      }
      imageFile = image.fileName;
    }

    const parsed = parseQuestion(body, imageFile);
    if (!parsed.ok) {
      await deleteImageQuiet(id, imageFile);
      res.status(400).json({ error: parsed.error });
      return;
    }

    manifest.questions.push(parsed.question);
    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      await deleteImageQuiet(id, imageFile);
      res.status(400).json({ error: written.error });
      return;
    }
    res.status(201).json({ pack: toAdminPack(id, manifest) });
  });

  // ---- Update question ------------------------------------------------------

  router.patch('/pogodi-broj-packs/:id/questions/:index', async (req, res) => {
    const id = req.params.id;
    if (!PACK_ID_RE.test(id)) {
      badId(res);
      return;
    }
    const manifest = await readManifestLax(id);
    if (!manifest) {
      res.status(404).json({ error: 'Pack ne postoji.' });
      return;
    }
    const index = Number(req.params.index);
    const existing = manifest.questions[index];
    if (!Number.isInteger(index) || !existing) {
      res.status(404).json({ error: 'Pitanje ne postoji.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;

    // A `removeImage` flag drops the picture; a new imageBase64 replaces it;
    // otherwise the existing image is kept.
    let imageFile = existing.imageFile;
    let replacedImage: string | undefined;
    if (body.removeImage === true) {
      replacedImage = existing.imageFile;
      imageFile = undefined;
    } else if (body.imageBase64 !== undefined && body.imageBase64 !== null) {
      const image = await saveImage(id, body.imageBase64);
      if (!image.ok) {
        res.status(400).json({ error: image.error });
        return;
      }
      replacedImage = existing.imageFile;
      imageFile = image.fileName;
    }

    const parsed = parseQuestion(body, imageFile);
    if (!parsed.ok) {
      // Roll back a freshly uploaded replacement image.
      if (imageFile && imageFile !== existing.imageFile) {
        await deleteImageQuiet(id, imageFile);
      }
      res.status(400).json({ error: parsed.error });
      return;
    }

    manifest.questions[index] = parsed.question;
    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      if (imageFile && imageFile !== existing.imageFile) {
        await deleteImageQuiet(id, imageFile);
      }
      res.status(400).json({ error: written.error });
      return;
    }
    if (replacedImage && replacedImage !== imageFile) {
      await deleteImageQuiet(id, replacedImage);
    }
    res.json({ pack: toAdminPack(id, manifest) });
  });

  // ---- Delete question ------------------------------------------------------

  router.delete('/pogodi-broj-packs/:id/questions/:index', async (req, res) => {
    const id = req.params.id;
    if (!PACK_ID_RE.test(id)) {
      badId(res);
      return;
    }
    const manifest = await readManifestLax(id);
    if (!manifest) {
      res.status(404).json({ error: 'Pack ne postoji.' });
      return;
    }
    const index = Number(req.params.index);
    const existing = manifest.questions[index];
    if (!Number.isInteger(index) || !existing) {
      res.status(404).json({ error: 'Pitanje ne postoji.' });
      return;
    }
    manifest.questions.splice(index, 1);
    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      res.status(400).json({ error: written.error });
      return;
    }
    await deleteImageQuiet(id, existing.imageFile);
    res.json({ pack: toAdminPack(id, manifest) });
  });

  return router;
}
