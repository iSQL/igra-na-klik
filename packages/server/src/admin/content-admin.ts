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
  parseTajniAgentiScenarioImport,
  TAJNI_AGENTI_MIN_WORDS,
  TAJNI_AGENTI_MAX_WORDS,
  TAJNI_AGENTI_MAX_WORD_LENGTH,
} from '@igra/shared';
import { PACK_ID_RE, requireAdmin, slugify, writeJsonAtomic, badId } from './admin-common.js';

/**
 * Admin CRUD API for JSON-only content packs: quiz question packs,
 * Ko sam ja packs, Tajni agenti word packs and Tajni agenti scenarios.
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
 * drafting) and scenarios (incomplete boards allowed while drafting) —
 * a draft that fails strict validation just stays invisible in the game.
 */

interface ContentDirs {
  questionPacksDir: string;
  /** Flat folder for uploaded quiz images, served at /quiz-images/<file>. */
  quizImagesDir: string;
  koSamJaPacksDir: string;
  tajniAgentiPacksDir: string;
  tajniAgentiScenariosDir: string;
}

const MAX_IMAGE_BASE64 = 8_000_000; // ~6 MB binary after decode

type CardType = 'red' | 'blue' | 'neutral' | 'assassin';
const CARD_TYPES = new Set<CardType>(['red', 'blue', 'neutral', 'assassin']);

const MAX_SCENARIO_CODE_LENGTH = 12;
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

  // ---------- tajni agenti scenarios ---------------------------------------------
  // File on disk: { code, name, cards: [{word, type}] × 25 }. Lax write:
  // empty words / off-balance boards are storable drafts; the strict check
  // result rides along in the response so the page can show why a draft is
  // still invisible in the game.

  function parseScenarioLax(
    body: Record<string, unknown>
  ):
    | { ok: true; data: { code: string; name: string; cards: { word: string; type: CardType }[] } }
    | { ok: false; error: string } {
    if (typeof body.code !== 'string' || body.code.trim().length === 0)
      return { ok: false, error: 'Nedostaje kod scenarija.' };
    const code = body.code.trim().toUpperCase();
    if (code.length > MAX_SCENARIO_CODE_LENGTH)
      return {
        ok: false,
        error: `Kod sme imati najviše ${MAX_SCENARIO_CODE_LENGTH} znakova.`,
      };
    const name = parseName(body, true);
    if (!name.ok) return { ok: false, error: name.error };
    if (!Array.isArray(body.cards) || body.cards.length !== 25)
      return { ok: false, error: 'Polje "cards" mora imati tačno 25 karata.' };
    const cards: { word: string; type: CardType }[] = [];
    for (let i = 0; i < body.cards.length; i++) {
      const card = body.cards[i] as Record<string, unknown> | undefined;
      if (!card || typeof card !== 'object')
        return { ok: false, error: `Karta ${i + 1}: nije objekat.` };
      const word = typeof card.word === 'string' ? card.word.trim() : '';
      if (word.length > 30)
        return { ok: false, error: `Karta ${i + 1}: reč predugačka (max 30).` };
      if (typeof card.type !== 'string' || !CARD_TYPES.has(card.type as CardType))
        return { ok: false, error: `Karta ${i + 1}: nevažeći tip.` };
      cards.push({ word, type: card.type as CardType });
    }
    return { ok: true, data: { code, name: name.name as string, cards } };
  }

  function describeScenario(id: string, raw: unknown): Record<string, unknown> {
    const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw
      : {}) as Record<string, unknown>;
    const code = typeof obj.code === 'string' ? obj.code : '';
    const name = typeof obj.name === 'string' ? obj.name : '';
    // Normalize to exactly 25 renderable cards so the editor grid always
    // has a full board even for malformed files.
    const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
    const cards: { word: string; type: CardType }[] = [];
    for (let i = 0; i < 25; i++) {
      const card = rawCards[i] as Record<string, unknown> | undefined;
      const word =
        card && typeof card.word === 'string' ? card.word : '';
      const type =
        card && typeof card.type === 'string' && CARD_TYPES.has(card.type as CardType)
          ? (card.type as CardType)
          : 'neutral';
      cards.push({ word, type });
    }
    const strict = parseTajniAgentiScenarioImport(raw);
    return {
      id,
      code,
      name,
      cards,
      visibleInGame: strict.ok,
      error: strict.ok ? undefined : strict.error,
      startingTeam: strict.ok ? strict.scenario.startingTeam : undefined,
    };
  }

  /** Fresh board template: 9 red / 8 blue / 7 neutral / 1 assassin, empty words. */
  function templateCards(): { word: string; type: CardType }[] {
    const types: CardType[] = [];
    for (let i = 0; i < 9; i++) types.push('red');
    for (let i = 0; i < 8; i++) types.push('blue');
    for (let i = 0; i < 7; i++) types.push('neutral');
    types.push('assassin');
    return types.map((type) => ({ word: '', type }));
  }

  mountPackRoutes({
    route: 'tajni-agenti-scenarios',
    dir: dirs.tajniAgentiScenariosDir,
    listKey: 'scenarios',
    nameRequiredOnCreate: true,
    describe: describeScenario,
    create: (body, name) => {
      if (typeof body.code !== 'string' || body.code.trim().length === 0)
        return { ok: false, error: 'Nedostaje kod scenarija.' };
      const code = body.code.trim().toUpperCase();
      if (code.length > MAX_SCENARIO_CODE_LENGTH)
        return {
          ok: false,
          error: `Kod sme imati najviše ${MAX_SCENARIO_CODE_LENGTH} znakova.`,
        };
      return {
        ok: true,
        data: { code, name: name as string, cards: templateCards() },
      };
    },
    replace: (body) => {
      const parsed = parseScenarioLax(body);
      if (!parsed.ok) return parsed;
      return { ok: true, data: parsed.data };
    },
  });

  return router;
}
