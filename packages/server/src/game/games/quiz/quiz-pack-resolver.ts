import path from 'path';
import { readFile, readdir } from 'fs/promises';
import type {
  KvizCategoryId,
  KvizImportQuestion,
  KvizPackManifest,
  KvizQuestionFull,
  KvizQuestionType,
} from '@igra/shared';
import {
  KVIZ_ANAGRAM_DEFAULT_TEXT,
  KVIZ_DOMINO_DEFAULT_HIGHER,
  KVIZ_DOMINO_DEFAULT_LOWER,
  KVIZ_DOMINO_DEFAULT_TEXT,
  KVIZ_DOPUNA_DEFAULT_TEXT,
  KVIZ_EMOJI_DEFAULT_TEXT,
  KVIZ_GEO_DEFAULT_TEXT,
  KVIZ_MATRICA_DEFAULT_TEXT,
  KVIZ_PIKSEL_DEFAULT_TEXT,
  kvizOptionsFromStrings,
  kvizTypeCounts,
  parseQuizImport,
  shuffled,
} from '@igra/shared';

export interface QuizPackSummary {
  id: string;
  fileName: string;
  name: string;
  description?: string;
  /** Grouping category id (undefined = treated as 'ostalo' on display). */
  category?: KvizCategoryId;
  count: number;
  /** Per-type question counts, e.g. { obicno: 10, geo: 3 }. */
  types: Partial<Record<KvizQuestionType, number>>;
}

export interface ResolvedQuizPack {
  id: string;
  name: string;
  questions: KvizQuestionFull[];
}

const PACK_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Materialize validated wire questions into runtime questions with answers.
 * `resolveFile` maps a pack-relative filename to a public URL (undefined for
 * inline imports — the parser already rejected file refs there).
 */
export function importQuestionsToRuntime(
  manifest: KvizPackManifest,
  idPrefix: string,
  resolveFile?: (file: string) => string
): KvizQuestionFull[] {
  const file = (f: string | undefined): string | undefined =>
    f && resolveFile ? resolveFile(f) : undefined;

  return manifest.questions.map((q: KvizImportQuestion, i): KvizQuestionFull => {
    const id = `${idPrefix}-${i + 1}`;
    const type = q.type ?? 'obicno';

    if (type === 'geo') {
      const geo = q as Extract<KvizImportQuestion, { type: 'geo' }>;
      const map = geo.mapId && manifest.maps ? manifest.maps[geo.mapId] : undefined;
      return {
        type: 'geo',
        id,
        text: geo.text ?? KVIZ_GEO_DEFAULT_TEXT,
        // Optional: text-only geo questions have no photo.
        imageUrl: geo.imageUrl ?? file(geo.imageFile),
        caption: geo.caption,
        mapImageUrl: map ? file(map.imageFile) : undefined,
        map,
        lat: geo.lat,
        lng: geo.lng,
        timeLimit: geo.timeLimit!,
      };
    }

    if (type === 'broj') {
      const broj = q as Extract<KvizImportQuestion, { type: 'broj' }>;
      return {
        type: 'broj',
        id,
        text: broj.text,
        imageUrl: broj.imageUrl ?? file(broj.imageFile),
        emoji: broj.emoji,
        min: broj.min,
        max: broj.max,
        step: broj.step,
        unit: broj.unit,
        valueType: broj.valueType,
        answer: broj.answer,
        timeLimit: broj.timeLimit!,
      };
    }

    if (type === 'emoji') {
      const emoji = q as Extract<KvizImportQuestion, { type: 'emoji' }>;
      return {
        type: 'emoji',
        id,
        text: emoji.text ?? KVIZ_EMOJI_DEFAULT_TEXT,
        emojis: emoji.emojis,
        answer: emoji.answer,
        accept: emoji.accept,
        category: emoji.category,
        timeLimit: emoji.timeLimit!,
      };
    }

    if (type === 'dopuna') {
      const d = q as Extract<KvizImportQuestion, { type: 'dopuna' }>;
      return {
        type: 'dopuna',
        id,
        text: d.text ?? KVIZ_DOPUNA_DEFAULT_TEXT,
        quote: d.quote,
        answer: d.answer,
        accept: d.accept,
        timeLimit: d.timeLimit!,
      };
    }

    if (type === 'piksel') {
      const p = q as Extract<KvizImportQuestion, { type: 'piksel' }>;
      return {
        type: 'piksel',
        id,
        text: p.text ?? KVIZ_PIKSEL_DEFAULT_TEXT,
        imageUrl: p.imageUrl ?? file(p.imageFile) ?? '',
        answer: p.answer,
        accept: p.accept,
        timeLimit: p.timeLimit!,
      };
    }

    if (type === 'anagram') {
      const a = q as Extract<KvizImportQuestion, { type: 'anagram' }>;
      return {
        type: 'anagram',
        id,
        text: a.text ?? KVIZ_ANAGRAM_DEFAULT_TEXT,
        answer: a.answer,
        accept: a.accept,
        timeLimit: a.timeLimit!,
      };
    }

    if (type === 'redosled') {
      const r = q as Extract<KvizImportQuestion, { type: 'redosled' }>;
      // One shuffle per resolution (= per game start): every client sees the
      // same presented order; `order[i]` is the correct rank of items[i].
      const perm = shuffled(r.items.map((_, idx) => idx));
      return {
        type: 'redosled',
        id,
        text: r.text,
        items: perm.map((idx) => r.items[idx]),
        order: perm,
        timeLimit: r.timeLimit!,
      };
    }

    if (type === 'domino') {
      const d = q as Extract<KvizImportQuestion, { type: 'domino' }>;
      return {
        type: 'domino',
        id,
        text: d.text ?? KVIZ_DOMINO_DEFAULT_TEXT,
        items: d.items,
        lowerLabel: d.lowerLabel ?? KVIZ_DOMINO_DEFAULT_LOWER,
        higherLabel: d.higherLabel ?? KVIZ_DOMINO_DEFAULT_HIGHER,
        unit: d.unit,
        valueType: d.valueType,
        timeLimit: d.timeLimit!,
      };
    }

    if (type === 'matrica') {
      const m = q as Extract<KvizImportQuestion, { type: 'matrica' }>;
      return {
        type: 'matrica',
        id,
        text: m.text ?? KVIZ_MATRICA_DEFAULT_TEXT,
        cells: m.cells,
        correct: m.correct,
        explanation: m.explanation,
        timeLimit: m.timeLimit!,
      };
    }

    // Choice types (obicno/audio/video/uljez).
    const choice = q as Extract<
      KvizImportQuestion,
      { options: string[]; correctIndex: number }
    >;
    return {
      type,
      id,
      text: choice.text,
      imageUrl:
        ('imageUrl' in choice ? choice.imageUrl : undefined) ??
        file('imageFile' in choice ? choice.imageFile : undefined),
      audioUrl:
        type === 'audio'
          ? ((choice as { audioUrl?: string }).audioUrl ??
            file((choice as { audioFile?: string }).audioFile))
          : undefined,
      video:
        type === 'video'
          ? {
              videoId: (choice as { videoId: string }).videoId,
              startSeconds: (choice as { startSeconds?: number }).startSeconds,
              endSeconds: (choice as { endSeconds?: number }).endSeconds,
            }
          : undefined,
      options: kvizOptionsFromStrings(choice.options),
      correctIndex: choice.correctIndex,
      timeLimit: choice.timeLimit!,
    };
  });
}

/** Inline (host file upload) questions → runtime; no pack folder to resolve. */
export function inlineQuestionsToRuntime(
  questions: KvizImportQuestion[]
): KvizQuestionFull[] {
  return importQuestionsToRuntime({ questions }, 'custom');
}

/**
 * Read every <name>.json directly inside packsDir, validate strictly, and
 * return public-safe summaries (never questions — manifests carry answers).
 * Skips any file that fails validation so one bad pack doesn't break the API.
 */
export async function listQuizPackSummaries(
  packsDir: string
): Promise<QuizPackSummary[]> {
  let entries;
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const summaries: QuizPackSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const id = entry.name.replace(/\.json$/i, '');
    if (!PACK_ID_RE.test(id)) continue;
    try {
      const raw = await readFile(path.join(packsDir, entry.name), 'utf-8');
      const parsed = parseQuizImport(JSON.parse(raw), { context: 'pack' });
      if (!parsed.ok) continue;
      summaries.push({
        id,
        fileName: entry.name,
        name: parsed.manifest.name ?? id,
        description: parsed.manifest.description,
        category: parsed.manifest.category,
        count: parsed.manifest.questions.length,
        types: kvizTypeCounts(parsed.manifest.questions),
      });
    } catch {
      // Ignore malformed file and continue.
    }
  }

  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return summaries;
}

/**
 * Load a specific pack by id, validate it, and resolve pack-relative assets
 * to public `/kviz-files/<id>/<file>` URLs. Returns `null` if the pack
 * doesn't exist or fails validation.
 */
export async function resolveQuizPack(
  packsDir: string,
  packId: string
): Promise<ResolvedQuizPack | null> {
  // Defense-in-depth: refuse anything that could escape packsDir.
  if (!PACK_ID_RE.test(packId)) return null;

  let raw: string;
  try {
    raw = await readFile(path.join(packsDir, `${packId}.json`), 'utf-8');
  } catch {
    return null;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = parseQuizImport(parsedJson, { context: 'pack' });
  if (!parsed.ok) return null;

  const questions = importQuestionsToRuntime(
    parsed.manifest,
    `pack-${packId}`,
    (file) => `/kviz-files/${packId}/${file}`
  );

  return {
    id: packId,
    name: parsed.manifest.name ?? packId,
    questions,
  };
}
