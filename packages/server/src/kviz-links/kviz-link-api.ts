import express, { type Request, type Response } from 'express';
import { KVIZ_LINK_PIN_RE, kvizLinkStatus } from '@igra/shared';
import type { RoomManager } from '../room/RoomManager.js';
import {
  KVIZ_LINK_MAX_TOTAL,
  KvizLinkStore,
  isValidKvizLinkSlug,
  normalizeKvizLinkSlug,
  type KvizLinkSettings,
  type StoredKvizLink,
} from './kviz-link-store.js';
import { buildPublicBank, countTypes, resolveLinkItems } from './kviz-link-questions.js';

/**
 * /api/k — the kviz-link API behind the /k/ pages and the phone's join card.
 *
 * Creating a link is public (no account): the creator picks a 4-digit PIN,
 * and a correct PIN buys an edit token (X-Kviz-Token) that every editing
 * call needs. Questions and answers only ever leave through those
 * token-gated calls; the public endpoints carry branding and counts.
 */

/** Sliding-window limiter keyed by client (IP) — in memory, per process. */
function keyedLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return true;
  };
}

function clientIp(req: Request): string {
  // Behind Coolify's proxy every request comes from the proxy; the first
  // forwarded hop is the real client. Spoofable, but it only feeds limits.
  const fwd = req.header('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : '') || req.socket.remoteAddress || '?';
}

export function createKvizLinkRouter(opts: {
  store: KvizLinkStore;
  questionPacksDir: string;
  roomManager: RoomManager;
}): express.Router {
  const { store, questionPacksDir, roomManager } = opts;
  const router = express.Router();
  // Covers arrive inline as data: URLs; question media go through /upload.
  router.use(express.json({ limit: '8mb' }));

  const createLimit = keyedLimiter(10, 3600_000);
  // The per-IP limit trusts X-Forwarded-For and can be dodged by spoofing it;
  // the per-slug one can't. It counts only WRONG PINs: 20 a day makes a
  // 4-digit PIN take months to guess, while the owner — who usually holds a
  // token already — is never locked out by a stranger's guesses.
  const unlockLimitIp = keyedLimiter(10, 10 * 60_000);
  const failedPinsPerSlug = keyedLimiter(20, 24 * 3600_000);
  const lockedSlug = new Map<string, number>();
  const uploadLimit = keyedLimiter(120, 3600_000);
  /** Slugs mid-create, so two simultaneous creates of one name can't both win. */
  const creating = new Set<string>();

  const fail = (res: Response, status: number, error: string) =>
    res.status(status).json({ error });

  /** The link named in the path, or a 404 already sent. */
  const linkOf = (req: Request, res: Response): StoredKvizLink | null => {
    const slug = String(req.params.slug ?? '');
    const link = isValidKvizLinkSlug(slug) ? store.get(slug) : undefined;
    if (!link) {
      fail(res, 404, 'Kviz link ne postoji.');
      return null;
    }
    return link;
  };

  /** The link plus a valid edit token, or a 401/404 already sent. */
  const authed = (req: Request, res: Response): StoredKvizLink | null => {
    const link = linkOf(req, res);
    if (!link) return null;
    if (!store.verifyToken(link, req.header('x-kviz-token') ?? '')) {
      fail(res, 401, 'Potreban je PIN.');
      return null;
    }
    return link;
  };

  /** Validate + media-check + resolve types, shared by create and save. */
  const prepare = async (
    slug: string,
    body: Record<string, unknown>,
    base?: KvizLinkSettings
  ): Promise<{ settings: KvizLinkSettings; types: StoredKvizLink['types'] } | { error: string }> => {
    const checked = store.validate(body, base);
    if (!checked.ok) return { error: checked.error };
    const settings = checked.settings;
    if ('coverData' in body && body.coverData) {
      const saved = await store.saveMedia(slug, body.coverData, 'cover');
      if ('error' in saved) return saved;
      settings.cover = saved.file;
    } else if (body.cover === null) {
      delete settings.cover;
    }
    const mediaError = await store.checkMedia(slug, settings);
    if (mediaError) return { error: mediaError };
    // Questions whose source vanished are dropped here rather than failing
    // the save — the editor shows what is left.
    const { resolved } = await resolveLinkItems(questionPacksDir, slug, settings.items, settings.own);
    const alive = new Set(resolved.map((r) => r.key));
    settings.items = settings.items.filter((k) => alive.has(k));
    return { settings, types: countTypes(resolved) };
  };

  const statsSummary = async (slug: string) => {
    const games = await store.readStats(slug);
    return {
      games: games.length,
      players: games.reduce((n, g) => n + g.players.length, 0),
      lastPlayedAt: games.length ? games[games.length - 1].at : null,
    };
  };

  // ---- Public ----------------------------------------------------------------

  router.get('/bank', async (_req, res) => {
    try {
      res.json(await buildPublicBank(questionPacksDir));
    } catch (err) {
      console.error('Kviz link bank failed:', err);
      fail(res, 500, 'Baza pitanja trenutno nije dostupna.');
    }
  });

  router.get('/check', (req, res) => {
    const slug = normalizeKvizLinkSlug(String(req.query.slug ?? ''));
    if (!isValidKvizLinkSlug(slug)) {
      res.json({ slug, available: false, reason: 'Naziv linka: 3–40 slova, cifara ili crtica.' });
      return;
    }
    const taken = store.isTaken(slug);
    res.json({ slug, available: !taken, ...(taken ? { reason: 'Zauzeto' } : {}) });
  });

  router.post('/', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const slug = normalizeKvizLinkSlug(String(body.slug ?? ''));
    if (!isValidKvizLinkSlug(slug)) {
      fail(res, 400, 'Naziv linka: 3–40 slova, cifara ili crtica.');
      return;
    }
    const pin = String(body.pin ?? '');
    if (!KVIZ_LINK_PIN_RE.test(pin)) {
      fail(res, 400, 'PIN mora imati tačno 4 cifre.');
      return;
    }
    if (store.isTaken(slug) || creating.has(slug)) {
      fail(res, 409, 'Taj link je već zauzet — izaberi drugi naziv.');
      return;
    }
    if (store.size >= KVIZ_LINK_MAX_TOTAL) {
      fail(res, 503, 'Trenutno nije moguće napraviti nov link.');
      return;
    }
    if (!createLimit(clientIp(req))) {
      fail(res, 429, 'Previše novih linkova — pokušaj ponovo kasnije.');
      return;
    }
    // Validate before touching the disk, so a bad payload leaves no folder.
    const pre = store.validate(body);
    if (!pre.ok) {
      fail(res, 400, pre.error);
      return;
    }
    creating.add(slug);
    try {
      const prepared = await prepare(slug, body);
      if ('error' in prepared) {
        // The cover may already sit in a fresh folder — don't let it hold the name.
        await store.discardFolder(slug);
        fail(res, 400, prepared.error);
        return;
      }
      const link = await store.create(slug, prepared.settings, pin, prepared.types);
      res.status(201).json({ slug, token: store.tokenFor(link), link: store.editorView(link) });
    } finally {
      creating.delete(slug);
    }
  });

  // The phone's join card: branding, the open lobby, results once expired.
  router.get('/:slug', async (req, res) => {
    const link = linkOf(req, res);
    if (!link) return;
    const status = kvizLinkStatus(link);
    const rooms = roomManager.findKvizLinkRooms(link.slug);
    const connected = (r: (typeof rooms)[number]) => r.players.filter((p) => p.isConnected).length;
    const lobby = rooms.find((r) => r.status === 'lobby' && connected(r) > 0);
    const running = rooms.find((r) => r.status !== 'lobby' && connected(r) > 0);
    let results: { name: string; emoji: string; color: string; points: number }[] | undefined;
    if (status === 'expired') {
      const games = await store.readStats(link.slug);
      results = games
        .flatMap((g) => g.players)
        .sort((a, b) => b.points - a.points)
        .slice(0, 10)
        .map(({ name, emoji, color, points }) => ({ name, emoji, color, points }));
    }
    res.json({
      link: store.publicInfo(link),
      status,
      lobby: lobby ? { code: lobby.code, playerCount: connected(lobby) } : null,
      running: running
        ? {
            code: running.code,
            playerCount: connected(running),
            knockable: running.players.some(
              (p) => p.id === running.remoteHostPlayerId && p.isConnected
            ),
          }
        : null,
      ...(results ? { results } : {}),
    });
  });

  router.post('/:slug/unlock', (req, res) => {
    const link = linkOf(req, res);
    if (!link) return;
    if ((lockedSlug.get(link.slug) ?? 0) > Date.now()) {
      fail(res, 429, 'Previše pogrešnih PIN-ova za ovaj kviz — pokušaj ponovo sutra.');
      return;
    }
    if (!unlockLimitIp(clientIp(req))) {
      fail(res, 429, 'Previše pokušaja — sačekaj par minuta.');
      return;
    }
    if (!store.verifyPin(link, String(req.body?.pin ?? ''))) {
      if (!failedPinsPerSlug(link.slug)) {
        lockedSlug.set(link.slug, Date.now() + 24 * 3600_000);
      }
      fail(res, 403, 'Pogrešan PIN.');
      return;
    }
    res.json({ token: store.tokenFor(link) });
  });

  // ---- PIN-gated -------------------------------------------------------------

  router.get('/:slug/manage', async (req, res) => {
    const link = authed(req, res);
    if (!link) return;
    res.json({
      link: store.editorView(link),
      public: store.publicInfo(link),
      status: kvizLinkStatus(link),
      stats: await statsSummary(link.slug),
    });
  });

  router.put('/:slug', async (req, res) => {
    const link = authed(req, res);
    if (!link) return;
    const prepared = await prepare(link.slug, (req.body ?? {}) as Record<string, unknown>, link);
    if ('error' in prepared) {
      fail(res, 400, prepared.error);
      return;
    }
    const saved = await store.update(link.slug, prepared.settings, prepared.types);
    if (!saved) {
      fail(res, 404, 'Kviz link ne postoji.');
      return;
    }
    // Lobbies already open on this link pick up the new name/brand on the
    // next game start; the card in an open lobby refreshes then.
    for (const room of roomManager.findKvizLinkRooms(link.slug)) {
      room.kvizLink = store.publicInfo(saved);
    }
    res.json({ link: store.editorView(saved), public: store.publicInfo(saved), status: kvizLinkStatus(saved) });
  });

  router.post('/:slug/pin', async (req, res) => {
    const link = authed(req, res);
    if (!link) return;
    const pin = String(req.body?.pin ?? '');
    if (!KVIZ_LINK_PIN_RE.test(pin)) {
      fail(res, 400, 'PIN mora imati tačno 4 cifre.');
      return;
    }
    const saved = await store.setPin(link.slug, pin);
    if (!saved) {
      fail(res, 404, 'Kviz link ne postoji.');
      return;
    }
    res.json({ token: store.tokenFor(saved) });
  });

  router.post('/:slug/upload', async (req, res) => {
    const link = authed(req, res);
    if (!link) return;
    if (!uploadLimit(link.slug)) {
      fail(res, 429, 'Previše otpremanja — sačekaj malo.');
      return;
    }
    const kind = req.body?.kind === 'audio' ? 'aud' : 'img';
    const saved = await store.saveMedia(link.slug, req.body?.data, kind);
    if ('error' in saved) {
      fail(res, 400, saved.error);
      return;
    }
    res.json({ file: saved.file, url: `/k-files/${link.slug}/${saved.file}` });
  });

  router.get('/:slug/stats', async (req, res) => {
    const link = authed(req, res);
    if (!link) return;
    res.json({ games: await store.readStats(link.slug) });
  });

  router.delete('/:slug', async (req, res) => {
    const link = authed(req, res);
    if (!link) return;
    await store.remove(link.slug);
    res.json({ ok: true });
  });

  return router;
}
