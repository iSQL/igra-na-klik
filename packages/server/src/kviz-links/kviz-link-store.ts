import path from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { readdir, readFile, rm, stat, unlink, writeFile } from 'fs/promises';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { KvizLinkPublic, KvizQuestionType } from '@igra/shared';
import {
  KVIZ_LINK_COLORS,
  KVIZ_LINK_JOIN_PIN_RE,
  KVIZ_LINK_MAX_DAYS,
  KVIZ_LINK_MAX_ITEMS,
  KVIZ_LINK_MAX_MESSAGE,
  KVIZ_LINK_MAX_NAME,
  KVIZ_LINK_MAX_OWN,
  KVIZ_LINK_PIN_RE,
  KVIZ_LINK_PLAYER_LIMITS,
  KVIZ_LINK_RESERVED_SLUGS,
  KVIZ_LINK_SLUG_RE,
  KVIZ_LINK_TIME_LIMITS,
  KVIZ_TYPE_SHORT,
  parseQuizImport,
} from '@igra/shared';
import { writeJsonAtomic } from '../admin/admin-common.js';
import { logger } from '../logger.js';
import {
  KVIZ_LINK_ITEM_RE,
  kvizLinkFileUrl,
  type KvizLinkOwnQuestion,
} from './kviz-link-questions.js';

/**
 * File-backed kviz links. Layout, one folder per link:
 *
 *   <root>/<slug>/link.json   settings + questions + PIN hash (carries answers)
 *   <root>/<slug>/stats.json  one record per finished game
 *   <root>/<slug>/<media>     cover + private-question images/audio
 *
 * Every link is loaded into memory at boot (they are small) so the socket
 * handlers and the quiz module can read them synchronously; writes go to disk
 * atomically. `/k-files/<slug>/<file>` serves the media, never the JSON.
 */

export interface KvizLinkSettings {
  name: string;
  emoji: string;
  color: string;
  message?: string;
  /** Media file in the link folder. */
  cover?: string;
  validFrom: number;
  expiresAt: number;
  /** Ordered source keys (see kviz-link-questions.ts). */
  items: string[];
  own: KvizLinkOwnQuestion[];
  order: 'fixed' | 'random';
  /** Random mode: questions drawn per game. */
  drawCount: number;
  /** Fixed seconds per question, or null = each question's own. */
  timeLimit: number | null;
  speedBonus: boolean;
  maxPlayers: number;
  /**
   * Entry PIN players must know to join. Kept in plain text on purpose: the
   * editor shows it so they can tell the players; it guards a party, not data.
   */
  joinPin?: string;
}

export interface StoredKvizLink extends KvizLinkSettings {
  slug: string;
  pinSalt: string;
  pinHash: string;
  createdAt: number;
  updatedAt: number;
  /** Per-type counts of the items that resolved at the last save. */
  types: Partial<Record<KvizQuestionType, number>>;
}

/** What one player answered to one question, compact per question type. */
export type KvizLinkAnswer =
  | { k: 'opt'; i: number }
  | { k: 'num'; v: number }
  /** Last guess, cut to 60 characters. */
  | { k: 'txt'; v: string }
  | { k: 'geo'; km: number }
  | { k: 'order'; hits: number; of: number }
  | { k: 'domino'; streak: number; of: number }
  | { k: 'cells'; v: number[]; hit: number };

export interface KvizLinkGamePlayer {
  name: string;
  emoji: string;
  color: string;
  points: number;
  correct: number;
  answered: number;
  /** Aligned with the record's questions: 1 correct, 0 wrong, null no answer. */
  results: (0 | 1 | null)[];
  /** Aligned with questions. Absent in games recorded before answers were kept. */
  answers?: (KvizLinkAnswer | null)[];
  /** Milliseconds to the answer, where the type has one. */
  ms?: (number | null)[];
}

/**
 * The question as it was played — the link (and its packs) change later, and
 * history must not change with them.
 */
export interface KvizLinkGameQuestion {
  key: string;
  text: string;
  type: KvizQuestionType;
  /** Choice options by index, matrica cells, redosled items in the correct order. */
  options?: string[];
  /** Option index, matrica triple, broj value or the text answer. */
  correct?: number | number[] | string;
  unit?: string;
  min?: number;
  max?: number;
  valueType?: 'number' | 'duration';
}

export interface KvizLinkGameRecord {
  at: number;
  questions: KvizLinkGameQuestion[];
  players: KvizLinkGamePlayer[];
}

const LINK_FILE = 'link.json';
const STATS_FILE = 'stats.json';
/** Statistics keep the newest games only — older ones drop off on append. */
const MAX_GAMES_KEPT = 50;
/** Server-wide cap on links — creation is public. */
export const KVIZ_LINK_MAX_TOTAL = 3000;
/** Expired links (and their stats) are deleted this long after expiry. */
const PURGE_AFTER_EXPIRY_MS = 60 * 24 * 3600_000;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_AUDIO_BYTES = 5_000_000;
const MAX_FOLDER_BYTES = 60_000_000;
/** Uploads not yet referenced survive a save this long (the form may still be open). */
const ORPHAN_GRACE_MS = 3600_000;

const DAY_MS = 24 * 3600_000;
const JOIN_FAIL_MAX = 20;
const JOIN_FAIL_WINDOW_MS = 10 * 60_000;
export const KVIZ_LINK_MEDIA_FILE_RE = /^(?:img|aud|cover)-[a-z0-9]{6,20}\.(?:jpg|png|webp|mp3|ogg|m4a)$/;

export function normalizeKvizLinkSlug(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function isValidKvizLinkSlug(slug: string): boolean {
  return KVIZ_LINK_SLUG_RE.test(slug) && !KVIZ_LINK_RESERVED_SLUGS.includes(slug);
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

type Validated = { ok: true; settings: KvizLinkSettings } | { ok: false; error: string };

export class KvizLinkStore {
  private links = new Map<string, StoredKvizLink>();
  /** Per-slug write queue so stats appends and saves never interleave. */
  private queues = new Map<string, Promise<unknown>>();
  /** slug → timestamps of wrong entry-PIN guesses (see checkJoinPin). */
  private joinFails = new Map<string, number[]>();

  constructor(readonly root: string) {}

  /** Synchronous boot load — the socket handlers read links synchronously. */
  load(): void {
    if (!existsSync(this.root)) return;
    for (const entry of readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isValidKvizLinkSlug(entry.name)) continue;
      try {
        const raw = JSON.parse(
          readFileSync(path.join(this.root, entry.name, LINK_FILE), 'utf-8')
        ) as StoredKvizLink;
        if (raw && raw.slug === entry.name && raw.pinHash) this.links.set(raw.slug, raw);
      } catch {
        // A folder without a readable link.json is skipped, not fatal.
      }
    }
    console.log(`Kviz linkovi: ${this.links.size} u ${this.root}`);
  }

  get(slug: string): StoredKvizLink | undefined {
    return this.links.get(slug);
  }

  /** Every link, newest edit first (admin overview). */
  list(): StoredKvizLink[] {
    return [...this.links.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get size(): number {
    return this.links.size;
  }

  dir(slug: string): string {
    return path.join(this.root, slug);
  }

  // ---- PIN + edit token ----------------------------------------------------

  verifyPin(link: StoredKvizLink, pin: string): boolean {
    if (!KVIZ_LINK_PIN_RE.test(pin)) return false;
    return safeEqualHex(hashPin(pin, link.pinSalt), link.pinHash);
  }

  /**
   * Edit token handed out after a correct PIN. Derived from the PIN hash, so
   * it needs no storage, survives restarts, and dies when the PIN changes.
   */
  tokenFor(link: StoredKvizLink): string {
    return createHmac('sha256', link.pinHash).update(`edit:${link.slug}`).digest('hex');
  }

  verifyToken(link: StoredKvizLink, token: string): boolean {
    return /^[0-9a-f]{64}$/.test(token) && safeEqualHex(this.tokenFor(link), token);
  }

  /**
   * Check a player's entry PIN. Wrong guesses are counted per link: after 20
   * in ten minutes the link refuses every guess for ten minutes, so a 4-digit
   * PIN can't be walked through by opening new sockets.
   */
  checkJoinPin(link: StoredKvizLink, pin: unknown): 'ok' | 'wrong' | 'locked' {
    if (!link.joinPin) return 'ok';
    const now = Date.now();
    const fails = (this.joinFails.get(link.slug) ?? []).filter((t) => now - t < JOIN_FAIL_WINDOW_MS);
    if (fails.length >= JOIN_FAIL_MAX) {
      this.joinFails.set(link.slug, fails);
      return 'locked';
    }
    const given = Buffer.from(typeof pin === 'string' ? pin.trim() : '');
    const want = Buffer.from(link.joinPin);
    if (given.length === want.length && timingSafeEqual(given, want)) return 'ok';
    fails.push(now);
    this.joinFails.set(link.slug, fails);
    return 'wrong';
  }

  // ---- Public view -----------------------------------------------------------

  publicInfo(link: StoredKvizLink): KvizLinkPublic {
    const typeKeys = (Object.keys(link.types) as KvizQuestionType[]).filter(
      (t) => (link.types[t] ?? 0) > 0
    );
    return {
      slug: link.slug,
      name: link.name,
      emoji: link.emoji,
      color: link.color,
      ...(link.message ? { message: link.message } : {}),
      ...(link.cover ? { coverUrl: kvizLinkFileUrl(link.slug, link.cover) } : {}),
      questionCount:
        link.order === 'random'
          ? Math.min(link.drawCount, link.items.length)
          : link.items.length,
      timeLimit: link.timeLimit,
      typeSummary:
        typeKeys.length === 0 ? '' : typeKeys.length === 1 ? KVIZ_TYPE_SHORT[typeKeys[0]] : 'mešovito',
      validFrom: link.validFrom,
      expiresAt: link.expiresAt,
      maxPlayers: link.maxPlayers,
      ...(link.joinPin ? { joinPinRequired: true } : {}),
    };
  }

  /** The editor's copy: everything but the PIN material. */
  editorView(link: StoredKvizLink): Omit<StoredKvizLink, 'pinSalt' | 'pinHash'> {
    const { pinSalt: _s, pinHash: _h, ...rest } = link;
    return rest;
  }

  // ---- Validation ------------------------------------------------------------

  /**
   * Check an editor payload. `base` fills the fields a partial save leaves
   * out (the wizard's first step sends no questions yet). Media references
   * are checked separately (they need the disk).
   */
  validate(raw: Record<string, unknown>, base?: KvizLinkSettings): Validated {
    const pick = <K extends keyof KvizLinkSettings>(k: K): unknown =>
      k in raw ? raw[k] : base?.[k];

    const name = typeof pick('name') === 'string' ? (pick('name') as string).trim() : '';
    if (!name) return { ok: false, error: 'Unesi naziv kviza.' };
    if (name.length > KVIZ_LINK_MAX_NAME) {
      return { ok: false, error: `Naziv može imati najviše ${KVIZ_LINK_MAX_NAME} znakova.` };
    }

    const emojiRaw = typeof pick('emoji') === 'string' ? (pick('emoji') as string).trim() : '';
    const emoji = emojiRaw && emojiRaw.length <= 16 ? emojiRaw : '🧠';
    const colorRaw = pick('color');
    const color =
      typeof colorRaw === 'string' && KVIZ_LINK_COLORS.includes(colorRaw)
        ? colorRaw
        : KVIZ_LINK_COLORS[0];
    const messageRaw =
      typeof pick('message') === 'string' ? (pick('message') as string).trim() : '';
    if (messageRaw.length > KVIZ_LINK_MAX_MESSAGE) {
      return { ok: false, error: `Poruka može imati najviše ${KVIZ_LINK_MAX_MESSAGE} znakova.` };
    }

    const validFrom = pick('validFrom');
    const expiresAt = pick('expiresAt');
    if (
      typeof validFrom !== 'number' ||
      typeof expiresAt !== 'number' ||
      !Number.isFinite(validFrom) ||
      !Number.isFinite(expiresAt)
    ) {
      return { ok: false, error: 'Unesi datum od kada i do kada link važi.' };
    }
    if (expiresAt <= validFrom) {
      return { ok: false, error: 'Datum isteka mora biti posle datuma početka.' };
    }
    if (expiresAt - validFrom > KVIZ_LINK_MAX_DAYS * DAY_MS) {
      return { ok: false, error: `Link može da važi najviše ${KVIZ_LINK_MAX_DAYS} dana.` };
    }

    const ownRaw = pick('own');
    if (ownRaw !== undefined && !Array.isArray(ownRaw)) {
      return { ok: false, error: 'Neispravna lista sopstvenih pitanja.' };
    }
    const ownList = (ownRaw as unknown[] | undefined) ?? [];
    if (ownList.length > KVIZ_LINK_MAX_OWN) {
      return { ok: false, error: `Najviše ${KVIZ_LINK_MAX_OWN} sopstvenih pitanja po kvizu.` };
    }
    const own: KvizLinkOwnQuestion[] = [];
    const ownIds = new Set<string>();
    for (let i = 0; i < ownList.length; i++) {
      const o = ownList[i] as { id?: unknown; question?: unknown } | null;
      const id = typeof o?.id === 'string' ? o.id : '';
      if (!/^[a-z0-9]{1,24}$/.test(id) || ownIds.has(id)) {
        return { ok: false, error: `Sopstveno pitanje ${i + 1}: neispravan id.` };
      }
      const q = o?.question as Record<string, unknown> | undefined;
      if (q && q.type === 'geo') {
        return { ok: false, error: `Sopstveno pitanje ${i + 1}: geo pitanja idu samo kroz pakete.` };
      }
      const parsed = parseQuizImport({ questions: [q] }, { context: 'pack' });
      if (!parsed.ok) {
        return { ok: false, error: `Sopstveno pitanje ${i + 1}: ${parsed.error}` };
      }
      ownIds.add(id);
      own.push({ id, question: parsed.manifest.questions[0] });
    }

    const itemsRaw = pick('items');
    if (itemsRaw !== undefined && !Array.isArray(itemsRaw)) {
      return { ok: false, error: 'Neispravna lista pitanja.' };
    }
    const items = ((itemsRaw as unknown[] | undefined) ?? []).filter(
      (k): k is string => typeof k === 'string'
    );
    if (items.length > KVIZ_LINK_MAX_ITEMS) {
      return { ok: false, error: `Kviz može imati najviše ${KVIZ_LINK_MAX_ITEMS} pitanja.` };
    }
    const seen = new Set<string>();
    for (const key of items) {
      if (!KVIZ_LINK_ITEM_RE.test(key) || seen.has(key)) {
        return { ok: false, error: 'Lista pitanja sadrži neispravnu stavku.' };
      }
      if (key.startsWith('own:') && !ownIds.has(key.slice(4))) {
        return { ok: false, error: 'Lista pitanja pominje nepostojeće sopstveno pitanje.' };
      }
      seen.add(key);
    }

    const order = pick('order') === 'random' ? 'random' : 'fixed';
    const drawRaw = pick('drawCount');
    const drawCount =
      typeof drawRaw === 'number' && Number.isInteger(drawRaw)
        ? Math.max(1, Math.min(KVIZ_LINK_MAX_ITEMS, drawRaw))
        : 10;
    const timeRaw = pick('timeLimit');
    const timeLimit =
      typeof timeRaw === 'number' && KVIZ_LINK_TIME_LIMITS.includes(timeRaw) ? timeRaw : null;
    const speedBonus = pick('speedBonus') !== false;
    const maxRaw = pick('maxPlayers');
    const maxPlayers =
      typeof maxRaw === 'number' && KVIZ_LINK_PLAYER_LIMITS.includes(maxRaw) ? maxRaw : 8;
    const joinRaw = pick('joinPin');
    const joinPin = typeof joinRaw === 'string' ? joinRaw.trim() : '';
    if (joinPin && !KVIZ_LINK_JOIN_PIN_RE.test(joinPin)) {
      return { ok: false, error: 'PIN za ulaz mora imati 4 do 6 cifara.' };
    }
    const coverRaw = pick('cover');
    const cover = typeof coverRaw === 'string' && KVIZ_LINK_MEDIA_FILE_RE.test(coverRaw) ? coverRaw : undefined;

    return {
      ok: true,
      settings: {
        name,
        emoji,
        color,
        ...(messageRaw ? { message: messageRaw } : {}),
        ...(cover ? { cover } : {}),
        validFrom,
        expiresAt,
        items,
        own,
        order,
        drawCount,
        timeLimit,
        speedBonus,
        maxPlayers,
        ...(joinPin ? { joinPin } : {}),
      },
    };
  }

  /** Every media file a settings object references must exist in the folder. */
  async checkMedia(slug: string, settings: KvizLinkSettings): Promise<string | null> {
    const files = new Set<string>();
    if (settings.cover) files.add(settings.cover);
    for (const o of settings.own) {
      const q = o.question as { imageFile?: string; audioFile?: string };
      if (q.imageFile) files.add(q.imageFile);
      if (q.audioFile) files.add(q.audioFile);
    }
    for (const f of files) {
      if (!KVIZ_LINK_MEDIA_FILE_RE.test(f) || !existsSync(path.join(this.dir(slug), f))) {
        return `Fajl „${f}" ne postoji — otpremi sliku ponovo.`;
      }
    }
    return null;
  }

  // ---- Writes ----------------------------------------------------------------

  private enqueue<T>(slug: string, job: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(slug) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(job);
    this.queues.set(slug, next);
    void next.finally(() => {
      if (this.queues.get(slug) === next) this.queues.delete(slug);
    });
    return next;
  }

  async create(
    slug: string,
    settings: KvizLinkSettings,
    pin: string,
    types: StoredKvizLink['types']
  ): Promise<StoredKvizLink> {
    mkdirSync(this.dir(slug), { recursive: true });
    const pinSalt = randomBytes(16).toString('hex');
    const now = Date.now();
    const link: StoredKvizLink = {
      slug,
      ...settings,
      pinSalt,
      pinHash: hashPin(pin, pinSalt),
      createdAt: now,
      updatedAt: now,
      types,
    };
    this.links.set(slug, link);
    await this.enqueue(slug, () => writeJsonAtomic(path.join(this.dir(slug), LINK_FILE), link));
    logger.info('kviz_link_created', { slug });
    return link;
  }

  /**
   * Reserve a folder for a slug before its first save, so a concurrent create
   * of the same name loses instead of overwriting.
   */
  isTaken(slug: string): boolean {
    return this.links.has(slug) || existsSync(this.dir(slug));
  }

  async update(
    slug: string,
    settings: KvizLinkSettings,
    types: StoredKvizLink['types']
  ): Promise<StoredKvizLink | null> {
    const link = this.links.get(slug);
    if (!link) return null;
    Object.assign(link, settings, { types, updatedAt: Date.now() });
    if (!settings.message) delete link.message;
    if (!settings.cover) delete link.cover;
    if (!settings.joinPin) delete link.joinPin;
    await this.enqueue(slug, () => writeJsonAtomic(path.join(this.dir(slug), LINK_FILE), link));
    void this.cleanupOrphans(slug);
    return link;
  }

  async setPin(slug: string, pin: string): Promise<StoredKvizLink | null> {
    const link = this.links.get(slug);
    if (!link) return null;
    link.pinSalt = randomBytes(16).toString('hex');
    link.pinHash = hashPin(pin, link.pinSalt);
    link.updatedAt = Date.now();
    await this.enqueue(slug, () => writeJsonAtomic(path.join(this.dir(slug), LINK_FILE), link));
    return link;
  }

  /** Drop a folder that never became a link (failed create). */
  async discardFolder(slug: string): Promise<void> {
    if (this.links.has(slug)) return;
    await rm(this.dir(slug), { recursive: true, force: true });
  }

  async remove(slug: string): Promise<void> {
    this.links.delete(slug);
    await this.enqueue(slug, () => rm(this.dir(slug), { recursive: true, force: true }));
    logger.info('kviz_link_deleted', { slug });
  }

  /** Decode a data: URL and store it in the link folder; returns the file name. */
  async saveMedia(
    slug: string,
    dataUrl: unknown,
    prefix: 'img' | 'aud' | 'cover'
  ): Promise<{ file: string } | { error: string }> {
    if (typeof dataUrl !== 'string') return { error: 'Nedostaje fajl.' };
    const image = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const audio = /^data:audio\/(mpeg|mp3|ogg|mp4|x-m4a|aac);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (prefix === 'aud' ? !audio : !image) {
      return { error: prefix === 'aud' ? 'Dozvoljen je mp3, ogg ili m4a.' : 'Dozvoljena je jpg, png ili webp slika.' };
    }
    const match = (audio ?? image)!;
    const bytes = Buffer.from(match[2], 'base64');
    const cap = prefix === 'aud' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
    if (bytes.length === 0) return { error: 'Prazan fajl.' };
    if (bytes.length > cap) {
      return { error: `Fajl je prevelik (najviše ${Math.round(cap / 1_000_000)} MB).` };
    }
    if ((await this.folderBytes(slug)) + bytes.length > MAX_FOLDER_BYTES) {
      return { error: 'Kviz je dostigao ograničenje prostora za slike i zvuk.' };
    }
    const kind = match[1];
    const ext =
      prefix === 'aud'
        ? kind === 'ogg'
          ? 'ogg'
          : kind === 'mp4' || kind === 'x-m4a' || kind === 'aac'
            ? 'm4a'
            : 'mp3'
        : kind === 'png'
          ? 'png'
          : kind === 'webp'
            ? 'webp'
            : 'jpg';
    const file = `${prefix}-${randomBytes(6).toString('hex')}.${ext}`;
    mkdirSync(this.dir(slug), { recursive: true });
    await writeFile(path.join(this.dir(slug), file), bytes);
    return { file };
  }

  private async folderBytes(slug: string): Promise<number> {
    let total = 0;
    try {
      for (const f of await readdir(this.dir(slug))) {
        total += (await stat(path.join(this.dir(slug), f))).size;
      }
    } catch {
      // Missing folder = nothing stored yet.
    }
    return total;
  }

  /** Delete media nothing references any more (older than the grace window). */
  private async cleanupOrphans(slug: string): Promise<void> {
    const link = this.links.get(slug);
    if (!link) return;
    const used = new Set<string>();
    if (link.cover) used.add(link.cover);
    for (const o of link.own) {
      const q = o.question as { imageFile?: string; audioFile?: string };
      if (q.imageFile) used.add(q.imageFile);
      if (q.audioFile) used.add(q.audioFile);
    }
    try {
      for (const f of await readdir(this.dir(slug))) {
        if (!KVIZ_LINK_MEDIA_FILE_RE.test(f) || used.has(f)) continue;
        const full = path.join(this.dir(slug), f);
        if (Date.now() - (await stat(full)).mtimeMs > ORPHAN_GRACE_MS) await unlink(full);
      }
    } catch {
      // Best effort.
    }
  }

  // ---- Stats -------------------------------------------------------------------

  async readStats(slug: string): Promise<KvizLinkGameRecord[]> {
    try {
      const raw = JSON.parse(
        await readFile(path.join(this.dir(slug), STATS_FILE), 'utf-8')
      ) as { games?: KvizLinkGameRecord[] };
      return Array.isArray(raw.games) ? raw.games : [];
    } catch {
      return [];
    }
  }

  recordGame(slug: string, record: KvizLinkGameRecord): Promise<void> {
    if (!this.links.has(slug)) return Promise.resolve();
    return this.enqueue(slug, async () => {
      const games = await this.readStats(slug);
      games.push(record);
      await writeJsonAtomic(path.join(this.dir(slug), STATS_FILE), {
        games: games.slice(-MAX_GAMES_KEPT),
      });
    }).catch((err) => {
      console.error(`Kviz link ${slug}: statistika nije upisana`, err);
    });
  }

  // ---- Housekeeping --------------------------------------------------------------

  /** Delete links that expired long ago. */
  async purgeExpired(now = Date.now()): Promise<void> {
    for (const link of [...this.links.values()]) {
      if (now - link.expiresAt > PURGE_AFTER_EXPIRY_MS) {
        await this.remove(link.slug);
      }
    }
  }
}

