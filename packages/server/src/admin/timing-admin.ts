import { Router } from 'express';
import express from 'express';
import { GAME_TIMING_DEFS, parseTimingOverrides } from '@igra/shared';
import { requireAdmin } from './admin-common.js';
import {
  getTimingOverrides,
  setTimingOverrides,
} from '../game/timing-config.js';

/**
 * Admin API for the configurable "wait" timings, served under /api/admin.
 * Same ADMIN_TOKEN gate as the content editors.
 *
 * - GET  /timing-config → { defs, overrides }  (defs drive the form layout)
 * - PUT  /timing-config → body is the overrides object; re-validated and
 *   clamped server-side (values equal to a default are dropped).
 */
export function createTimingAdminRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '256kb' }));
  router.use(requireAdmin);

  router.get('/timing-config', (_req, res) => {
    res.json({ defs: GAME_TIMING_DEFS, overrides: getTimingOverrides() });
  });

  router.put('/timing-config', async (req, res) => {
    const parsed = parseTimingOverrides(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      await setTimingOverrides(parsed.overrides);
    } catch (err) {
      console.error('timing-admin: failed to save timing config:', err);
      res.status(500).json({ error: 'Ne mogu da sačuvam podešavanja.' });
      return;
    }
    res.json({ overrides: parsed.overrides });
  });

  return router;
}
