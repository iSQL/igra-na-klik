import { Router, type Response } from 'express';
import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'fs/promises';
import type { Dirent } from 'fs';
import {
  parseGeoPackImport,
  latLngToSvg,
  svgToLatLng,
  SERBIAN_DISTRICTS,
} from '@igra/shared';
import type { GeoPackManifest, SerbianDistrict } from '@igra/shared';
import { PACK_ID_RE, requireAdmin, slugify, writeJsonAtomic, badId } from './admin-common.js';

/**
 * Admin CRUD API for geo-packs (Pogodi gde je / Foto kviz content).
 *
 * The editor page at /admin/geo talks to these routes. Everything is
 * protected by the ADMIN_TOKEN env var via the X-Admin-Token header; when
 * the var is unset the whole API answers 403 so a bare deployment can't be
 * edited by strangers.
 *
 * Pins arrive as normalized map coords {x, y} ∈ [0, 1] (a click on the map
 * image) and are converted to lat/lng here via the shared calibrated
 * projection — the browser page does no geo math at all.
 */

const MAX_IMAGE_BASE64 = 8_000_000; // ~6 MB binary after decode
const MAX_CAPTION_LENGTH = 200;
const DISTRICT_SET = new Set<string>(SERBIAN_DISTRICTS);

interface AdminLocation {
  imageFile: string;
  imageUrl: string;
  lat: number;
  lng: number;
  pin: { x: number; y: number };
  district?: string;
  caption?: string;
}

interface AdminPack {
  id: string;
  name: string;
  description?: string;
  locations: AdminLocation[];
}

export function createGeoAdminRouter(geoPacksDir: string): Router {
  const router = Router();

  // Image uploads ride inside JSON as base64, so this router needs a much
  // larger body cap than the app-wide default.
  router.use(express.json({ limit: '10mb' }));
  router.use(requireAdmin);

  const manifestPath = (id: string) => path.join(geoPacksDir, `${id}.json`);
  const imagesDir = (id: string) => path.join(geoPacksDir, id);

  async function readManifestLax(
    id: string
  ): Promise<GeoPackManifest | null> {
    let raw: string;
    try {
      raw = await readFile(manifestPath(id), 'utf-8');
    } catch {
      return null;
    }
    try {
      const parsed = parseGeoPackImport(JSON.parse(raw), { allowEmpty: true });
      return parsed.ok ? parsed.manifest : null;
    } catch {
      return null;
    }
  }

  /** Validate the final shape and write atomically via writeJsonAtomic. */
  async function writeManifest(
    id: string,
    manifest: GeoPackManifest
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const check = parseGeoPackImport(manifest, { allowEmpty: true });
    if (!check.ok) return { ok: false, error: check.error };
    await writeJsonAtomic(manifestPath(id), check.manifest);
    return { ok: true };
  }

  function toAdminPack(id: string, manifest: GeoPackManifest): AdminPack {
    return {
      id,
      name: manifest.name,
      description: manifest.description,
      locations: manifest.locations.map((loc) => ({
        imageFile: loc.imageFile,
        imageUrl: `/geo-images/${id}/${loc.imageFile}`,
        lat: loc.lat,
        lng: loc.lng,
        pin: latLngToSvg(loc.lat, loc.lng),
        district: loc.district,
        caption: loc.caption,
      })),
    };
  }

  /** Parse {pin:{x,y}} from a request body into lat/lng, or report why not. */
  function pinToLatLng(
    body: Record<string, unknown>
  ): { ok: true; lat: number; lng: number } | { ok: false; error: string } {
    const pin = body.pin as { x?: unknown; y?: unknown } | undefined;
    if (
      !pin ||
      typeof pin.x !== 'number' ||
      typeof pin.y !== 'number' ||
      !Number.isFinite(pin.x) ||
      !Number.isFinite(pin.y)
    ) {
      return { ok: false, error: 'Pin nije postavljen.' };
    }
    if (pin.x < 0 || pin.x > 1 || pin.y < 0 || pin.y > 1) {
      return { ok: false, error: 'Pin je van mape.' };
    }
    const { lat, lng } = svgToLatLng(pin.x, pin.y);
    return { ok: true, lat, lng };
  }

  function parseCaption(
    body: Record<string, unknown>
  ): { ok: true; caption?: string } | { ok: false; error: string } {
    if (body.caption === undefined || body.caption === null)
      return { ok: true, caption: undefined };
    if (typeof body.caption !== 'string')
      return { ok: false, error: 'Caption mora biti tekst.' };
    const trimmed = body.caption.trim();
    if (trimmed.length > MAX_CAPTION_LENGTH)
      return {
        ok: false,
        error: `Caption predugačak (max ${MAX_CAPTION_LENGTH} znakova).`,
      };
    return { ok: true, caption: trimmed.length > 0 ? trimmed : undefined };
  }

  function parseDistrict(
    body: Record<string, unknown>
  ):
    | { ok: true; district?: SerbianDistrict }
    | { ok: false; error: string } {
    if (body.district === undefined || body.district === null || body.district === '')
      return { ok: true, district: undefined };
    if (typeof body.district !== 'string' || !DISTRICT_SET.has(body.district))
      return { ok: false, error: `Nepoznat okrug "${String(body.district)}".` };
    return { ok: true, district: body.district as SerbianDistrict };
  }

  /** Decode a data:image/...;base64 payload and write it as <uuid>.<ext>. */
  async function saveImage(
    packId: string,
    imageBase64: unknown
  ): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
    if (typeof imageBase64 !== 'string' || imageBase64.length === 0)
      return { ok: false, error: 'Nedostaje slika.' };
    if (imageBase64.length > MAX_IMAGE_BASE64)
      return { ok: false, error: 'Slika je prevelika (max ~6 MB).' };
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

  async function deleteImageQuiet(packId: string, fileName: string) {
    // The manifest validator already rejects '..' but be defensive anyway.
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\'))
      return;
    try {
      await unlink(path.join(imagesDir(packId), fileName));
    } catch {
      // Already gone — fine.
    }
  }

  // ---- Pack list (full contents, including empty packs) -------------------

  router.get('/geo-packs', async (_req, res) => {
    let entries: Dirent[];
    try {
      entries = await readdir(geoPacksDir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        res.json({ packs: [] });
        return;
      }
      console.error('geo-admin: failed to read packs dir:', err);
      res.status(500).json({ error: 'Ne mogu da pročitam geo-packs folder.' });
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

  router.post('/geo-packs', async (req, res) => {
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

    let id =
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

    const manifest: GeoPackManifest = { name, description, locations: [] };
    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      res.status(400).json({ error: written.error });
      return;
    }
    res.status(201).json({ pack: toAdminPack(id, manifest) });
  });

  // ---- Update pack metadata ------------------------------------------------

  router.patch('/geo-packs/:id', async (req, res) => {
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

  router.delete('/geo-packs/:id', async (req, res) => {
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

  // ---- Add location ----------------------------------------------------------

  router.post('/geo-packs/:id/locations', async (req, res) => {
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

    const coords = pinToLatLng(body);
    if (!coords.ok) {
      res.status(400).json({ error: coords.error });
      return;
    }
    const caption = parseCaption(body);
    if (!caption.ok) {
      res.status(400).json({ error: caption.error });
      return;
    }
    const district = parseDistrict(body);
    if (!district.ok) {
      res.status(400).json({ error: district.error });
      return;
    }
    const image = await saveImage(id, body.imageBase64);
    if (!image.ok) {
      res.status(400).json({ error: image.error });
      return;
    }

    manifest.locations.push({
      imageFile: image.fileName,
      lat: round6(coords.lat),
      lng: round6(coords.lng),
      district: district.district,
      caption: caption.caption,
    });
    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      await deleteImageQuiet(id, image.fileName);
      res.status(400).json({ error: written.error });
      return;
    }
    res.status(201).json({ pack: toAdminPack(id, manifest) });
  });

  // ---- Update location --------------------------------------------------------

  router.patch('/geo-packs/:id/locations/:index', async (req, res) => {
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
    const loc = manifest.locations[index];
    if (!Number.isInteger(index) || !loc) {
      res.status(404).json({ error: 'Lokacija ne postoji.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (body.pin !== undefined) {
      const coords = pinToLatLng(body);
      if (!coords.ok) {
        res.status(400).json({ error: coords.error });
        return;
      }
      loc.lat = round6(coords.lat);
      loc.lng = round6(coords.lng);
    }
    if (body.caption !== undefined) {
      const caption = parseCaption(body);
      if (!caption.ok) {
        res.status(400).json({ error: caption.error });
        return;
      }
      loc.caption = caption.caption;
    }
    if (body.district !== undefined) {
      const district = parseDistrict(body);
      if (!district.ok) {
        res.status(400).json({ error: district.error });
        return;
      }
      loc.district = district.district;
    }
    let replacedImage: string | null = null;
    if (body.imageBase64 !== undefined) {
      const image = await saveImage(id, body.imageBase64);
      if (!image.ok) {
        res.status(400).json({ error: image.error });
        return;
      }
      replacedImage = loc.imageFile;
      loc.imageFile = image.fileName;
    }

    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      if (replacedImage) await deleteImageQuiet(id, loc.imageFile);
      res.status(400).json({ error: written.error });
      return;
    }
    if (replacedImage) await deleteImageQuiet(id, replacedImage);
    res.json({ pack: toAdminPack(id, manifest) });
  });

  // ---- Delete location ----------------------------------------------------------

  router.delete('/geo-packs/:id/locations/:index', async (req, res) => {
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
    const loc = manifest.locations[index];
    if (!Number.isInteger(index) || !loc) {
      res.status(404).json({ error: 'Lokacija ne postoji.' });
      return;
    }
    manifest.locations.splice(index, 1);
    const written = await writeManifest(id, manifest);
    if (!written.ok) {
      res.status(400).json({ error: written.error });
      return;
    }
    await deleteImageQuiet(id, loc.imageFile);
    res.json({ pack: toAdminPack(id, manifest) });
  });

  return router;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
