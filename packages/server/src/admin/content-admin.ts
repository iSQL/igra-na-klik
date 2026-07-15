import { Router, type Response } from 'express';
import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import type { Dirent } from 'fs';
import {
  parseQuizImport,
  parseKoSamJaImport,
  parseTajniAgentiImport,
  parseGluvoDobaPack,
  parseEmojiImport,
  parseSpijunPack,
  TAJNI_AGENTI_MIN_WORDS,
  TAJNI_AGENTI_MAX_WORDS,
  TAJNI_AGENTI_MAX_WORD_LENGTH,
} from '@igra/shared';
import { PACK_ID_RE, requireAdmin, slugify, writeJsonAtomic, badId } from './admin-common.js';

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
  emojiPacksDir: string;
  spijunPacksDir: string;
}

const MAX_IMAGE_BASE64 = 8_000_000; // ~6 MB binary after decode

const MAX_NAME_LENGTH = 80;

export function createContentAdminRouter(dirs: ContentDirs): Router {
  const router = Router();
  // Quiz image uploads ride inside JSON as base64, so allow a large body.
  router.use(express.json({ limit: '10mb' }));
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
      res.json({ ok: true });
    });
  }

  // ---------- quiz question packs ---------------------------------------------
  // File on disk: array of {text, options: string[], correctIndex, timeLimit?}.

  function quizQuestionsToFile(questions: unknown[]):
    | { ok: true; data: unknown }
    | { ok: false; error: string } {
    if (questions.length === 0) return { ok: true, data: [] };
    const parsed = parseQuizImport(questions);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return {
      ok: true,
      data: parsed.questions.map((q) => ({
        text: q.text,
        options: q.options.map((o) => o.text),
        correctIndex: q.correctIndex,
        timeLimit: q.timeLimit,
        // Only persist the field when set — keeps text-only packs unchanged.
        ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
      })),
    };
  }

  mountPackRoutes({
    route: 'quiz-packs',
    dir: dirs.questionPacksDir,
    listKey: 'packs',
    nameRequiredOnCreate: true,
    describe: (id, raw) => {
      const questions = Array.isArray(raw) ? raw : [];
      const strict =
        questions.length > 0 ? parseQuizImport(questions) : { ok: false as const };
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
      return quizQuestionsToFile(body.questions);
    },
  });

  // ---------- quiz image upload -------------------------------------------------
  // POST { imageBase64 } → writes a downscaled JPEG/PNG into quizImagesDir and
  // returns { imageUrl: '/quiz-images/<uuid>.<ext>' }. The editor then stores
  // that short path on the question and saves the pack via the whole-file PUT.
  // Images are shared across packs (flat store); deleting a pack leaves its
  // images behind — harmless for a self-hosted tool.
  router.post('/quiz-image', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const imageBase64 = body.imageBase64;
    if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      res.status(400).json({ error: 'Nedostaje slika.' });
      return;
    }
    if (imageBase64.length > MAX_IMAGE_BASE64) {
      res.status(400).json({ error: 'Slika je prevelika (max ~6 MB).' });
      return;
    }
    const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(imageBase64);
    if (!match) {
      res.status(400).json({ error: 'Nevažeći format slike.' });
      return;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    let data: Buffer;
    try {
      data = Buffer.from(match[2], 'base64');
    } catch {
      res.status(400).json({ error: 'Neispravan base64 sadržaj.' });
      return;
    }
    if (data.length === 0) {
      res.status(400).json({ error: 'Prazna slika.' });
      return;
    }
    const fileName = `${randomUUID()}.${ext}`;
    try {
      await mkdir(dirs.quizImagesDir, { recursive: true });
      await writeFile(path.join(dirs.quizImagesDir, fileName), data);
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

  // ---------- emoji zagonetke packs ---------------------------------------------
  // File on disk: array of {emojis, answer, accept?: string[], timeLimit?}.

  mountPackRoutes({
    route: 'emoji-packs',
    dir: dirs.emojiPacksDir,
    listKey: 'packs',
    nameRequiredOnCreate: true,
    describe: (id, raw) => {
      const puzzles = Array.isArray(raw) ? raw : [];
      const strict =
        puzzles.length > 0 ? parseEmojiImport(puzzles) : { ok: false as const };
      return {
        id,
        count: puzzles.length,
        visibleInGame: strict.ok === true,
        error:
          strict.ok === false && puzzles.length > 0
            ? (strict as { error?: string }).error
            : undefined,
        puzzles,
      };
    },
    create: () => ({ ok: true, data: [] }),
    replace: (body) => {
      if (!Array.isArray(body.puzzles))
        return { ok: false, error: 'Polje "puzzles" mora biti niz.' };
      if (body.puzzles.length === 0) return { ok: true, data: [] };
      const parsed = parseEmojiImport(body.puzzles);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        data: parsed.puzzles.map((p) => ({
          emojis: p.emojis,
          answer: p.answer,
          ...(p.accept ? { accept: p.accept } : {}),
          timeLimit: p.timeLimit,
        })),
      };
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
