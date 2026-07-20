import { Router } from 'express';
import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import archiver from 'archiver';
import { requireAdmin } from './admin-common.js';
import { isDeployDataMode, resetDataToDefaults } from '../data-paths.js';

/**
 * Admin data-management API: download a full backup (.zip) of every content
 * pack + uploaded images/audio + timing overrides, and a factory reset that
 * restores the baked-in defaults. Same ADMIN_TOKEN gate as the other editors.
 *
 * Reset is only meaningful in deploy mode (persistent volume seeded from
 * defaults); in dev it would wipe the tracked working copy, so it's refused.
 */

interface DataAdminOpts {
  /** Resolved content dirs to include in the backup, each as `<name>/…`. */
  contentDirs: { name: string; path: string }[];
  timingFile: string;
  /** Extra loose files to include in the backup zip (e.g. quiz feedback). */
  extraFiles?: string[];
  /** Refresh in-memory caches after a reset (e.g. re-init timing config). */
  onReset: () => void;
}

export function createDataAdminRouter(opts: DataAdminOpts): Router {
  const router = Router();
  router.use(express.json());
  router.use(requireAdmin);

  // Whether the factory-reset action is available (deploy mode only). The UI
  // uses this to explain why the button is disabled in dev.
  router.get('/data-status', (_req, res) => {
    res.json({ deployMode: isDeployDataMode });
  });

  // Stream a zip of all editable content. Fetched with the admin token header
  // by the SPA, then turned into a download client-side.
  router.get('/backup', (_req, res) => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="igra-backup-${stamp}.zip"`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') console.error('[backup] warning', err);
    });
    archive.on('error', (err) => {
      console.error('[backup] error', err);
      res.destroy(err);
    });
    archive.pipe(res);

    for (const d of opts.contentDirs) {
      if (existsSync(d.path)) archive.directory(d.path, d.name);
    }
    if (existsSync(opts.timingFile)) {
      archive.file(opts.timingFile, { name: path.basename(opts.timingFile) });
    }
    for (const f of opts.extraFiles ?? []) {
      if (existsSync(f)) archive.file(f, { name: path.basename(f) });
    }
    archive.finalize();
  });

  // Restore baked-in defaults, discarding every admin edit. Requires an
  // explicit confirm flag so a stray request can't nuke the content.
  router.post('/reset-defaults', (req, res) => {
    if (!isDeployDataMode) {
      res.status(400).json({
        error:
          'Reset je dostupan samo u deploy modu (DATA_DIR i SEED_DIR nisu postavljeni).',
      });
      return;
    }
    if (!req.body || req.body.confirm !== true) {
      res.status(400).json({ error: 'Potvrda je obavezna.' });
      return;
    }
    try {
      resetDataToDefaults(opts.timingFile);
      opts.onReset();
      res.json({ ok: true });
    } catch (err) {
      console.error('[reset]', err);
      res
        .status(500)
        .json({ error: (err as Error).message || 'Reset nije uspeo.' });
    }
  });

  return router;
}
