import { Router, type Response } from 'express';
import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'fs/promises';
import type { Dirent } from 'fs';
import {
  parseQuizImport,
  kvizTypeCounts,
  packLatLngToPin,
  packPinToLatLng,
  parseKoSamJaImport,
  parseTajniAgentiImport,
  parseGluvoDobaPack,
  parseSpijunPack,
  TAJNI_AGENTI_MIN_WORDS,
  TAJNI_AGENTI_MAX_WORDS,
  TAJNI_AGENTI_MAX_WORD_LENGTH,
} from '@igra/shared';
import type { GeoMapBBox, GeoPackMapDef } from '@igra/shared';
import { PACK_ID_RE, requireAdmin, slugify, writeJsonAtomic, badId } from './admin-common.js';
import { getQuizFeedback, clearQuizFeedback } from '../game/quiz-feedback.js';
import { readZipEntries } from './zip-read.js';

/**
 * Admin CRUD API for JSON-only content packs: quiz question packs,
 * Ko sam ja packs and Tajni agenti word packs.
 *
 * Same auth model as the geo admin (X-Admin-Token vs ADMIN_TOKEN). Unlike
 * geo-packs there are no images here, so editing is whole-file PUT: the
 * page keeps the pack in memory and PUTs the full contents on every save.
 *
 * Reads are LAX (raw JSON passed through with a validity flag) so broken
 * or draft files can be opened and repaired in the editor; the in-game
 * listing endpoints stay strict and simply skip such files. Writes are
 * strict for quiz / ko-sam-ja (the editor form builds one valid question
 * at a time) but lax for tajni-agenti packs (< 25 words allowed while
 * drafting) — a draft that fails strict validation just stays invisible in
 * the game.
 */

interface ContentDirs {
  questionPacksDir: string;
  /** Flat folder for uploaded quiz images, served at /quiz-images/<file>. */
  quizImagesDir: string;
  koSamJaPacksDir: string;
  tajniAgentiPacksDir: string;
  gluvoDobaPacksDir: string;
  spijunPacksDir: string;
}

const MAX_IMAGE_BASE64 = 8_000_000; // ~6 MB binary after decode
const MAX_AUDIO_BASE64 = 14_000_000; // ~10 MB binary after decode

const MAX_NAME_LENGTH = 80;

export function createContentAdminRouter(dirs: ContentDirs): Router {
  const router = Router();
  // Image/audio uploads ride inside JSON as base64, so allow a large body.
  router.use(express.json({ limit: '16mb' }));
  router.use(requireAdmin);

  // ---------- generic helpers ------------------------------------------------

  async function listJsonIds(dir: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
      .map((e) => e.name.replace(/\.json$/i, ''))
      .filter((id) => PACK_ID_RE.test(id))
      .sort((a, b) => a.localeCompare(b));
  }

  async function readJsonQuiet(filePath: string): Promise<unknown | undefined> {
    try {
      return JSON.parse(await readFile(filePath, 'utf-8'));
    } catch {
      return undefined;
    }
  }

  const fileExists = async (filePath: string) =>
    (await readJsonQuiet(filePath)) !== undefined;

  function parseName(
    body: Record<string, unknown>,
    required: boolean
  ): { ok: true; name?: string } | { ok: false; error: string } {
    if (body.name === undefined || body.name === null || body.name === '') {
      return required
        ? { ok: false, error: 'Nedostaje naziv.' }
        : { ok: true, name: undefined };
    }
    if (typeof body.name !== 'string')
      return { ok: false, error: 'Naziv mora biti tekst.' };
    const trimmed = body.name.trim();
    if (!trimmed) {
      return required
        ? { ok: false, error: 'Nedostaje naziv.' }
        : { ok: true, name: undefined };
    }
    if (trimmed.length > MAX_NAME_LENGTH)
      return { ok: false, error: `Naziv predugačak (max ${MAX_NAME_LENGTH}).` };
    return { ok: true, name: trimmed };
  }

  /** Resolve the id for a POST create: explicit id, or slugified name. */
  function resolveNewId(
    body: Record<string, unknown>,
    fallbackName: string | undefined,
    res: Response
  ): string | null {
    const id =
      typeof body.id === 'string' && body.id.trim().length > 0
        ? body.id.trim()
        : slugify(fallbackName ?? '');
    if (!PACK_ID_RE.test(id)) {
      badId(res);
      return null;
    }
    return id;
  }

  /**
   * Wire up list / create / replace / delete routes for one content type.
   * The type-specific behavior is injected through `describe` (lax read →
   * API shape), `create` (initial file contents for POST) and `replace`
   * (validate a PUT body → file contents).
   */
  function mountPackRoutes(opts: {
    route: string;
    dir: string;
    listKey: string;
    nameRequiredOnCreate: boolean;
    describe: (id: string, raw: unknown) => Record<string, unknown>;
    create: (
      body: Record<string, unknown>,
      name: string | undefined
    ) => { ok: true; data: unknown } | { ok: false; error: string };
    replace: (
      body: Record<string, unknown>
    ) => { ok: true; data: unknown } | { ok: false; error: string };
    /** Extra cleanup after a successful DELETE (e.g. the pack's asset folder). */
    afterDelete?: (id: string) => Promise<void>;
  }) {
    const filePath = (id: string) => path.join(opts.dir, `${id}.json`);

    router.get(`/${opts.route}`, async (_req, res) => {
      try {
        const ids = await listJsonIds(opts.dir);
        const items: Record<string, unknown>[] = [];
        for (const id of ids) {
          const raw = await readJsonQuiet(filePath(id));
          if (raw === undefined) continue; // not JSON at all — nothing to edit
          items.push(opts.describe(id, raw));
        }
        res.json({ [opts.listKey]: items });
      } catch (err) {
        console.error(`content-admin: failed to list ${opts.route}:`, err);
        res.status(500).json({ error: 'Ne mogu da pročitam folder.' });
      }
    });

    router.post(`/${opts.route}`, async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = parseName(body, opts.nameRequiredOnCreate);
      if (!name.ok) {
        res.status(400).json({ error: name.error });
        return;
      }
      const id = resolveNewId(body, name.name, res);
      if (!id) return;
      if (await fileExists(filePath(id))) {
        res.status(409).json({ error: `Pack "${id}" već postoji.` });
        return;
      }
      const created = opts.create(body, name.name);
      if (!created.ok) {
        res.status(400).json({ error: created.error });
        return;
      }
      await writeJsonAtomic(filePath(id), created.data);
      res.status(201).json({ item: opts.describe(id, created.data) });
    });

    router.put(`/${opts.route}/:id`, async (req, res) => {
      const id = req.params.id;
      if (!PACK_ID_RE.test(id)) {
        badId(res);
        return;
      }
      if (!(await fileExists(filePath(id)))) {
        res.status(404).json({ error: 'Pack ne postoji.' });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const replaced = opts.replace(body);
      if (!replaced.ok) {
        res.status(400).json({ error: replaced.error });
        return;
      }
      await writeJsonAtomic(filePath(id), replaced.data);
      res.json({ item: opts.describe(id, replaced.data) });
    });

    router.delete(`/${opts.route}/:id`, async (req, res) => {
      const id = req.params.id;
      if (!PACK_ID_RE.test(id)) {
        badId(res);
        return;
      }
      try {
        await unlink(filePath(id));
      } catch {
        res.status(404).json({ error: 'Pack ne postoji.' });
        return;
      }
      if (opts.afterDelete) {
        try {
          await opts.afterDelete(id);
        } catch (err) {
          console.error(`content-admin: afterDelete cleanup failed for ${id}:`, err);
        }
      }
      res.json({ ok: true });
    });
  }

  // ---------- kviz question packs -----------------------------------------------
  // File on disk: manifest { name?, description?, maps?, questions: [...] }
  // (legacy bare-array packs still parse and upgrade to the object format on
  // the first save). Questions are type-discriminated: obicno/geo/broj/audio/
  // video — validated by the shared parseQuizImport in 'pack' context.

  function describeQuizPack(id: string, raw: unknown): Record<string, unknown> {
    const lax = parseQuizImport(raw, { context: 'pack', allowEmpty: true });
    const strict = parseQuizImport(raw, { context: 'pack' });
    // Even when lax parsing fails, surface the raw fields so a broken pack
    // can be opened and repaired in the editor.
    const obj = (Array.isArray(raw) ? { questions: raw } : (raw ?? {})) as Record<
      string,
      unknown
    >;
    const questions = lax.ok
      ? lax.manifest.questions
      : Array.isArray(obj.questions)
        ? obj.questions
        : [];
    return {
      id,
      name: lax.ok
        ? lax.manifest.name
        : typeof obj.name === 'string'
          ? obj.name
          : undefined,
      description: lax.ok
        ? lax.manifest.description
        : typeof obj.description === 'string'
          ? obj.description
          : undefined,
      category: lax.ok
        ? lax.manifest.category
        : typeof obj.category === 'string'
          ? obj.category
          : undefined,
      maps: lax.ok ? (lax.manifest.maps ?? {}) : (obj.maps ?? {}),
      count: questions.length,
      types: lax.ok ? kvizTypeCounts(lax.manifest.questions) : {},
      visibleInGame: strict.ok,
      error: strict.ok ? undefined : strict.error,
      questions,
    };
  }

  mountPackRoutes({
    route: 'quiz-packs',
    dir: dirs.questionPacksDir,
    listKey: 'packs',
    nameRequiredOnCreate: true,
    describe: describeQuizPack,
    create: (_body, name) => ({ ok: true, data: { name, questions: [] } }),
    replace: (body) => {
      const parsed = parseQuizImport(body, { context: 'pack', allowEmpty: true });
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const m = parsed.manifest;
      return {
        ok: true,
        data: {
          ...(m.name ? { name: m.name } : {}),
          ...(m.description ? { description: m.description } : {}),
          ...(m.category ? { category: m.category } : {}),
          ...(m.maps && Object.keys(m.maps).length > 0 ? { maps: m.maps } : {}),
          questions: m.questions,
        },
      };
    },
    afterDelete: async (id) => {
      // Remove the pack's asset folder (images/audio/maps) alongside the json.
      await rm(path.join(dirs.questionPacksDir, id), {
        recursive: true,
        force: true,
      });
    },
  });

  function decodeBase64Media(
    raw: unknown,
    kind: 'image' | 'audio'
  ): { ok: true; ext: string; data: Buffer } | { ok: false; error: string } {
    if (typeof raw !== 'string' || raw.length === 0) {
      return { ok: false, error: kind === 'image' ? 'Nedostaje slika.' : 'Nedostaje audio fajl.' };
    }
    const cap = kind === 'image' ? MAX_IMAGE_BASE64 : MAX_AUDIO_BASE64;
    if (raw.length > cap) {
      return {
        ok: false,
        error: kind === 'image' ? 'Slika je prevelika (max ~6 MB).' : 'Audio je prevelik (max ~10 MB).',
      };
    }
    const match =
      kind === 'image'
        ? /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(raw)
        : /^data:audio\/(mpeg|mp3|ogg|mp4|x-m4a|aac);base64,(.+)$/.exec(raw);
    if (!match) {
      return { ok: false, error: kind === 'image' ? 'Nevažeći format slike.' : 'Nevažeći audio format (mp3/ogg/m4a).' };
    }
    const extMap: Record<string, string> = {
      jpeg: 'jpg',
      jpg: 'jpg',
      png: 'png',
      webp: 'webp',
      mpeg: 'mp3',
      mp3: 'mp3',
      ogg: 'ogg',
      mp4: 'm4a',
      'x-m4a': 'm4a',
      aac: 'm4a',
    };
    let data: Buffer;
    try {
      data = Buffer.from(match[2], 'base64');
    } catch {
      return { ok: false, error: 'Neispravan base64 sadržaj.' };
    }
    if (data.length === 0) return { ok: false, error: 'Prazan fajl.' };
    return { ok: true, ext: extMap[match[1]], data };
  }

  // ---------- kviz pack asset upload ---------------------------------------------
  // POST /quiz-packs/:id/file { kind: 'image'|'audio', dataBase64 } → writes
  // <uuid>.<ext> into the pack's asset folder and returns { file, url }. The
  // editor stores the filename on the question (imageFile/audioFile) and saves
  // the manifest via the whole-file PUT. Orphaned files after edits/deletes
  // are harmless for a self-hosted tool.
  router.post('/quiz-packs/:id/file', async (req, res) => {
    const id = req.params.id;
    if (!PACK_ID_RE.test(id)) {
      badId(res);
      return;
    }
    if (!(await fileExists(path.join(dirs.questionPacksDir, `${id}.json`)))) {
      res.status(404).json({ error: 'Pack ne postoji.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const kind = body.kind === 'audio' ? 'audio' : 'image';
    const decoded = decodeBase64Media(body.dataBase64, kind);
    if (!decoded.ok) {
      res.status(400).json({ error: decoded.error });
      return;
    }
    const fileName = `${randomUUID()}.${decoded.ext}`;
    try {
      const packDir = path.join(dirs.questionPacksDir, id);
      await mkdir(packDir, { recursive: true });
      await writeFile(path.join(packDir, fileName), decoded.data);
    } catch (err) {
      console.error('content-admin: failed to write kviz pack file:', err);
      res.status(500).json({ error: 'Ne mogu da sačuvam fajl.' });
      return;
    }
    res.status(201).json({ file: fileName, url: `/kviz-files/${id}/${fileName}` });
  });

  // ---------- player quiz feedback (reports + ratings) ----------------------------
  // Collected live during games and keyed `pack:<packId>:<index>` /
  // `bank:<index>` so the editor joins it to a pack's questions by position.
  router.get('/quiz-feedback', (_req, res) => {
    res.json({ feedback: getQuizFeedback() });
  });

  // Clear a question's feedback (admin "mark resolved"). Key is passed in the
  // body because it contains ':' — awkward as a path param.
  router.post('/quiz-feedback/clear', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = typeof body.key === 'string' ? body.key : '';
    if (!key) {
      res.status(400).json({ error: 'Nedostaje ključ.' });
      return;
    }
    const cleared = clearQuizFeedback(key);
    res.json({ ok: true, cleared });
  });

  // ---------- import a generated quiz pack (.zip or bare .json) --------------------
  // Body is the raw file (Content-Type app/octet-stream). A .zip carries
  // `pack.json` + an `assets/` folder (from the public /kviz-generator); a bare
  // .json is a manifest with no assets. Creates a NEW pack (uniquified id from
  // the name) so an import never clobbers an existing pack.
  const IMG_EXT_RE = /\.(jpg|jpeg|png|webp)$/i;
  const AUD_EXT_RE = /\.(mp3|ogg|m4a)$/i;
  const MAX_ASSET_BYTES = 12_000_000;

  router.post(
    '/import-quiz-zip',
    express.raw({ type: () => true, limit: '64mb' }),
    async (req, res) => {
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        res.status(400).json({ error: 'Prazan ili nevažeći fajl.' });
        return;
      }

      let manifestRaw: unknown;
      let assets: { name: string; data: Buffer }[] = [];
      const isZip =
        buf.length > 4 &&
        buf[0] === 0x50 &&
        buf[1] === 0x4b &&
        buf[2] === 0x03 &&
        buf[3] === 0x04;

      if (isZip) {
        let entries;
        try {
          entries = readZipEntries(buf);
        } catch (err) {
          res.status(400).json({ error: (err as Error).message });
          return;
        }
        const packEntry = entries.find(
          (e) => e.name === 'pack.json' || path.basename(e.name) === 'pack.json'
        );
        if (!packEntry) {
          res.status(400).json({ error: 'U .zip-u nema pack.json.' });
          return;
        }
        try {
          manifestRaw = JSON.parse(packEntry.data.toString('utf-8'));
        } catch {
          res.status(400).json({ error: 'pack.json nije validan JSON.' });
          return;
        }
        assets = entries
          .filter((e) => e.name.startsWith('assets/'))
          .map((e) => ({ name: path.basename(e.name), data: e.data }));
      } else {
        try {
          manifestRaw = JSON.parse(buf.toString('utf-8'));
        } catch {
          res.status(400).json({ error: 'Fajl nije .zip ni validan .json.' });
          return;
        }
      }

      const parsed = parseQuizImport(manifestRaw, { context: 'pack' });
      if (!parsed.ok) {
        res.status(400).json({ error: 'Nevažeći pack: ' + parsed.error });
        return;
      }
      const m = parsed.manifest;

      // Unique id from the pack name so we never overwrite an existing pack.
      const base = slugify(m.name ?? 'pack') || 'pack';
      let id = base;
      let n = 2;
      while (await fileExists(path.join(dirs.questionPacksDir, `${id}.json`))) {
        id = `${base}-${n++}`;
        if (n > 999) break;
      }

      // Which assets the questions (and custom maps) actually reference.
      const referenced = new Set<string>();
      for (const q of m.questions as unknown as Record<string, unknown>[]) {
        if (typeof q.imageFile === 'string') referenced.add(q.imageFile);
        if (typeof q.audioFile === 'string') referenced.add(q.audioFile);
      }
      if (m.maps) {
        for (const k of Object.keys(m.maps)) {
          const mf = m.maps[k]?.imageFile;
          if (mf) referenced.add(mf);
        }
      }

      const assetByName = new Map(assets.map((a) => [a.name, a.data]));
      const packDir = path.join(dirs.questionPacksDir, id);
      let written = 0;
      const missing: string[] = [];
      if (referenced.size > 0) {
        await mkdir(packDir, { recursive: true });
        for (const name of referenced) {
          if (name.includes('..') || name.includes('/') || name.includes('\\')) continue;
          if (!IMG_EXT_RE.test(name) && !AUD_EXT_RE.test(name)) continue;
          const data = assetByName.get(name);
          if (!data) {
            missing.push(name);
            continue;
          }
          if (data.length > MAX_ASSET_BYTES) {
            missing.push(name);
            continue;
          }
          await writeFile(path.join(packDir, name), data);
          written++;
        }
      }

      const data = {
        name: m.name ?? id,
        ...(m.description ? { description: m.description } : {}),
        ...(m.category ? { category: m.category } : {}),
        ...(m.maps && Object.keys(m.maps).length > 0 ? { maps: m.maps } : {}),
        questions: m.questions,
      };
      await writeJsonAtomic(path.join(dirs.questionPacksDir, `${id}.json`), data);

      res.status(201).json({
        item: describeQuizPack(id, data),
        id,
        assetsWritten: written,
        missingAssets: missing,
      });
    }
  );

  // ---------- pin ↔ lat/lng conversion --------------------------------------------
  // Stateless helper for the kviz editor's geo question picker — the page does
  // no geo math (same policy as the old geo editor). Pass `bbox` for a custom
  // mercator map; omit it for the bundled Serbia map projection.
  router.post('/pin-convert', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    let map: GeoPackMapDef | undefined;
    if (body.bbox !== undefined && body.bbox !== null) {
      const b = body.bbox as Record<string, unknown>;
      const nums: Partial<GeoMapBBox> = {};
      for (const key of ['minLat', 'maxLat', 'minLng', 'maxLng'] as const) {
        if (typeof b[key] !== 'number' || !Number.isFinite(b[key])) {
          res.status(400).json({ error: 'Nevažeći bbox.' });
          return;
        }
        nums[key] = b[key] as number;
      }
      map = { imageFile: '_', bbox: nums as GeoMapBBox };
    }

    const pin = body.pin as { x?: unknown; y?: unknown } | undefined;
    if (pin && typeof pin.x === 'number' && typeof pin.y === 'number') {
      const x = Math.max(0, Math.min(1, pin.x));
      const y = Math.max(0, Math.min(1, pin.y));
      res.json({ latLng: packPinToLatLng(map, x, y) });
      return;
    }
    if (typeof body.lat === 'number' && typeof body.lng === 'number') {
      res.json({ pin: packLatLngToPin(map, body.lat, body.lng) });
      return;
    }
    res.status(400).json({ error: 'Pošalji { pin } ili { lat, lng }.' });
  });

  // ---------- legacy flat quiz image upload ---------------------------------------
  // POST { imageBase64 } → writes into quizImagesDir, served at
  // /quiz-images/<file>. Kept for images shared across packs and for inline
  // (host file upload) question sets that can't use pack folders.
  router.post('/quiz-image', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const decoded = decodeBase64Media(body.imageBase64, 'image');
    if (!decoded.ok) {
      res.status(400).json({ error: decoded.error });
      return;
    }
    const fileName = `${randomUUID()}.${decoded.ext}`;
    try {
      await mkdir(dirs.quizImagesDir, { recursive: true });
      await writeFile(path.join(dirs.quizImagesDir, fileName), decoded.data);
    } catch (err) {
      console.error('content-admin: failed to write quiz image:', err);
      res.status(500).json({ error: 'Ne mogu da sačuvam sliku.' });
      return;
    }
    res.status(201).json({ imageUrl: `/quiz-images/${fileName}` });
  });

  // ---------- ko sam ja packs ---------------------------------------------------
  // File on disk: array of shape-discriminated question objects.

  mountPackRoutes({
    route: 'ko-sam-ja-packs',
    dir: dirs.koSamJaPacksDir,
    listKey: 'packs',
    nameRequiredOnCreate: true,
    describe: (id, raw) => {
      const questions = Array.isArray(raw) ? raw : [];
      const strict =
        questions.length > 0 ? parseKoSamJaImport(questions) : { ok: false as const };
      return {
        id,
        count: questions.length,
        visibleInGame: strict.ok === true,
        error: strict.ok === false && questions.length > 0
          ? (strict as { error?: string }).error
          : undefined,
        questions,
      };
    },
    create: () => ({ ok: true, data: [] }),
    replace: (body) => {
      if (!Array.isArray(body.questions))
        return { ok: false, error: 'Polje "questions" mora biti niz.' };
      if (body.questions.length === 0) return { ok: true, data: [] };
      const parsed = parseKoSamJaImport(body.questions);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, data: parsed.questions };
    },
  });

  // ---------- tajni agenti word packs -------------------------------------------
  // File on disk: { name?, words: string[] }. Lax write: fewer than the
  // in-game minimum (25) is allowed while drafting — such packs simply stay
  // out of the game list.

  function parseWordsLax(
    body: Record<string, unknown>
  ): { ok: true; words: string[] } | { ok: false; error: string } {
    if (!Array.isArray(body.words))
      return { ok: false, error: 'Polje "words" mora biti niz.' };
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < body.words.length; i++) {
      const v = body.words[i];
      if (typeof v !== 'string')
        return { ok: false, error: `Reč ${i + 1} nije tekst.` };
      const trimmed = v.trim();
      if (!trimmed) continue;
      if (trimmed.length > TAJNI_AGENTI_MAX_WORD_LENGTH)
        return {
          ok: false,
          error: `Reč "${trimmed.slice(0, 20)}…" je duža od ${TAJNI_AGENTI_MAX_WORD_LENGTH} znakova.`,
        };
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(trimmed);
    }
    if (cleaned.length > TAJNI_AGENTI_MAX_WORDS)
      return {
        ok: false,
        error: `Paket sme imati najviše ${TAJNI_AGENTI_MAX_WORDS} reči.`,
      };
    return { ok: true, words: cleaned };
  }

  mountPackRoutes({
    route: 'tajni-agenti-packs',
    dir: dirs.tajniAgentiPacksDir,
    listKey: 'packs',
    nameRequiredOnCreate: true,
    describe: (id, raw) => {
      let name: string | undefined;
      let words: string[] = [];
      if (Array.isArray(raw)) {
        words = raw.filter((w): w is string => typeof w === 'string');
      } else if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.name === 'string') name = obj.name;
        if (Array.isArray(obj.words))
          words = obj.words.filter((w): w is string => typeof w === 'string');
      }
      const strict = parseTajniAgentiImport(raw);
      return {
        id,
        name,
        count: words.length,
        minWords: TAJNI_AGENTI_MIN_WORDS,
        visibleInGame: strict.ok,
        error: strict.ok ? undefined : strict.error,
        words,
      };
    },
    create: (_body, name) => ({ ok: true, data: { name, words: [] } }),
    replace: (body) => {
      const name = parseName(body, false);
      if (!name.ok) return { ok: false, error: name.error };
      const words = parseWordsLax(body);
      if (!words.ok) return { ok: false, error: words.error };
      return {
        ok: true,
        data: name.name ? { name: name.name, words: words.words } : { words: words.words },
      };
    },
  });

  // ---------- gluvo doba role packs ---------------------------------------------
  // File on disk: { name?, wolves, roles: GluvoDobaRoleId[] }. A pack curates
  // which roles are in play; strict validation (valid wolf count + role ids)
  // gates visibility in the game.

  mountPackRoutes({
    route: 'gluvo-doba-packs',
    dir: dirs.gluvoDobaPacksDir,
    listKey: 'packs',
    nameRequiredOnCreate: true,
    describe: (id, raw) => {
      const parsed = parseGluvoDobaPack(raw);
      const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : {}) as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name : undefined;
      const wolves = typeof obj.wolves === 'number' ? obj.wolves : 2;
      const roles = Array.isArray(obj.roles) ? obj.roles : [];
      return {
        id,
        name: parsed.ok ? parsed.pack.name : name,
        wolves: parsed.ok ? parsed.pack.wolves : wolves,
        roles: parsed.ok ? parsed.pack.roles : roles,
        count: parsed.ok ? parsed.pack.roles.length : roles.length,
        visibleInGame: parsed.ok,
        error: parsed.ok ? undefined : parsed.error,
      };
    },
    create: (_body, name) => ({
      ok: true,
      data: { name, wolves: 2, roles: ['vidovnjak', 'zmaj'] },
    }),
    replace: (body) => {
      const parsed = parseGluvoDobaPack(body);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, data: parsed.pack };
    },
  });

  // ---------- špijun location packs -----------------------------------------
  // File on disk: { name?, locations: [{ location, roles: string[] }] }.
  // Writes accept drafts (0 locations, allowEmpty) — a pack under the in-game
  // minimum stays editable but invisible in the game (strict re-check).

  mountPackRoutes({
    route: 'spijun-packs',
    dir: dirs.spijunPacksDir,
    listKey: 'packs',
    nameRequiredOnCreate: true,
    describe: (id, raw) => {
      const strict = parseSpijunPack(raw);
      const lax = parseSpijunPack(raw, { allowEmpty: true });
      const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : {}) as Record<string, unknown>;
      const name =
        (lax.ok ? lax.pack.name : undefined) ??
        (typeof obj.name === 'string' ? obj.name : undefined);
      const locations = lax.ok
        ? lax.pack.locations
        : Array.isArray(obj.locations)
          ? obj.locations
          : [];
      return {
        id,
        name,
        count: locations.length,
        visibleInGame: strict.ok,
        error: strict.ok ? undefined : strict.error,
        locations,
      };
    },
    create: (_body, name) => ({ ok: true, data: { name, locations: [] } }),
    replace: (body) => {
      const parsed = parseSpijunPack(body, { allowEmpty: true });
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, data: parsed.pack };
    },
  });

  return router;
}
