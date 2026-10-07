import { Router } from 'express';
import { kvizLinkStatus } from '@igra/shared';
import { requireAdmin } from './admin-common.js';
import type { RoomManager } from '../room/RoomManager.js';
import { isValidKvizLinkSlug, type KvizLinkStore } from '../kviz-links/kviz-link-store.js';

/**
 * Admin view of every kviz link ("Kviz linkovi" tab). Editing reuses the
 * link's own editor: the admin gets the same edit token a correct PIN would
 * give, the page stores it in this browser and opens /k/<naziv>/uredi — so
 * there is one editor, not a second copy inside the admin SPA.
 */
export function createKvizLinkAdminRouter(opts: {
  store: KvizLinkStore;
  roomManager: RoomManager;
}): Router {
  const { store, roomManager } = opts;
  const router = Router();
  router.use(requireAdmin);

  router.get('/kviz-links', async (_req, res) => {
    const links = await Promise.all(
      store.list().map(async (l) => {
        const games = await store.readStats(l.slug);
        const rooms = roomManager.findKvizLinkRooms(l.slug);
        return {
          slug: l.slug,
          name: l.name,
          emoji: l.emoji,
          color: l.color,
          status: kvizLinkStatus(l),
          items: l.items.length,
          own: l.own.length,
          order: l.order,
          drawCount: l.drawCount,
          validFrom: l.validFrom,
          expiresAt: l.expiresAt,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
          games: games.length,
          players: games.reduce((n, g) => n + g.players.length, 0),
          lastPlayedAt: games.length ? games[games.length - 1].at : null,
          // Players on the link right now (lobby or a running game).
          online: rooms.reduce((n, r) => n + r.players.filter((p) => p.isConnected).length, 0),
        };
      })
    );
    res.json({ links });
  });

  router.post('/kviz-links/:slug/token', (req, res) => {
    const link = isValidKvizLinkSlug(req.params.slug) ? store.get(req.params.slug) : undefined;
    if (!link) {
      res.status(404).json({ error: 'Kviz link ne postoji.' });
      return;
    }
    res.json({ token: store.tokenFor(link) });
  });

  router.delete('/kviz-links/:slug', async (req, res) => {
    const link = isValidKvizLinkSlug(req.params.slug) ? store.get(req.params.slug) : undefined;
    if (!link) {
      res.status(404).json({ error: 'Kviz link ne postoji.' });
      return;
    }
    await store.remove(link.slug);
    res.json({ ok: true });
  });

  return router;
}
