/**
 * One-shot migration: converts legacy geo-packs/ and pogodi-broj-packs/ into
 * unified kviz packs under question-packs/ (new manifest format with typed
 * questions), copying image folders along. Also exports the old built-in
 * "Pogodi broj" bank as a generated pack.
 *
 * Run BEFORE deleting the legacy games (it imports their parsers):
 *   npm run build:shared && npx tsx scripts/migrate-to-kviz.ts [--force]
 *
 * Idempotent: existing targets are skipped (use --force to overwrite).
 * Sources are copied, never deleted — remove geo-packs/ and
 * pogodi-broj-packs/ manually once the migrated packs are verified in-game.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import {
  POGODI_BROJ_QUESTIONS,
  parseGeoPackImport,
  parsePogodiBrojImport,
  parseQuizImport,
} from '../packages/shared/src/index.js';
import type { KvizImportQuestion, KvizPackManifest } from '../packages/shared/src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEO_DIR = process.env.GEO_PACKS_DIR ?? path.join(ROOT, 'geo-packs');
const BROJ_DIR = process.env.POGODI_BROJ_PACKS_DIR ?? path.join(ROOT, 'pogodi-broj-packs');
const TARGET_DIR = process.env.QUESTION_PACKS_DIR ?? path.join(ROOT, 'question-packs');
const FORCE = process.argv.includes('--force');

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listJsonIds(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
      .map((e) => e.name.replace(/\.json$/i, ''));
  } catch {
    return [];
  }
}

/** Pick a free target id: <id>, then <prefix><id>, then <prefix><id>-2… */
async function resolveTargetId(id: string, prefix: string): Promise<string> {
  const candidates = [id, `${prefix}${id}`];
  for (let n = 2; n < 20; n++) candidates.push(`${prefix}${id}-${n}`);
  for (const c of candidates) {
    if (FORCE && (c === id || c === `${prefix}${id}`)) return c;
    if (!(await exists(path.join(TARGET_DIR, `${c}.json`)))) return c;
  }
  throw new Error(`No free id for ${id}`);
}

async function writePack(targetId: string, manifest: KvizPackManifest): Promise<boolean> {
  const check = parseQuizImport(manifest, { context: 'pack' });
  if (!check.ok) {
    console.error(`  ✗ ${targetId}: migrated manifest fails validation: ${check.error}`);
    return false;
  }
  await mkdir(TARGET_DIR, { recursive: true });
  await writeFile(
    path.join(TARGET_DIR, `${targetId}.json`),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8'
  );
  return true;
}

async function copyAssets(srcFolder: string, targetId: string): Promise<void> {
  if (!(await exists(srcFolder))) return;
  await cp(srcFolder, path.join(TARGET_DIR, targetId), { recursive: true, force: true });
}

async function migrateGeoPacks(): Promise<void> {
  const ids = await listJsonIds(GEO_DIR);
  if (ids.length === 0) {
    console.log('geo-packs: nothing to migrate.');
    return;
  }
  for (const id of ids) {
    const raw = JSON.parse(await readFile(path.join(GEO_DIR, `${id}.json`), 'utf-8'));
    const parsed = parseGeoPackImport(raw);
    if (!parsed.ok) {
      console.warn(`  ⚠ geo pack ${id} invalid (${parsed.error}) — skipped.`);
      continue;
    }
    const targetId = await resolveTargetId(id, 'geo-');
    if (!FORCE && (await exists(path.join(TARGET_DIR, `${targetId}.json`)))) {
      console.warn(`  ⚠ target ${targetId}.json exists — skipped (use --force).`);
      continue;
    }
    const m = parsed.manifest;
    const questions: KvizImportQuestion[] = m.locations.map((l) => ({
      type: 'geo',
      imageFile: l.imageFile,
      caption: l.caption,
      lat: l.lat,
      lng: l.lng,
      mapId: m.map ? 'main' : undefined,
    }));
    const manifest: KvizPackManifest = {
      name: m.name,
      description: m.description,
      maps: m.map ? { main: m.map } : undefined,
      questions,
    };
    if (await writePack(targetId, manifest)) {
      await copyAssets(path.join(GEO_DIR, id), targetId);
      console.log(`  ✓ geo pack ${id} → ${targetId} (${questions.length} pitanja)`);
    }
  }
}

async function migrateBrojPacks(): Promise<void> {
  const ids = await listJsonIds(BROJ_DIR);
  if (ids.length === 0) {
    console.log('pogodi-broj-packs: nothing to migrate.');
    return;
  }
  for (const id of ids) {
    const raw = JSON.parse(await readFile(path.join(BROJ_DIR, `${id}.json`), 'utf-8'));
    const parsed = parsePogodiBrojImport(raw);
    if (!parsed.ok) {
      console.warn(`  ⚠ broj pack ${id} invalid (${parsed.error}) — skipped.`);
      continue;
    }
    const targetId = await resolveTargetId(id, 'broj-');
    if (!FORCE && (await exists(path.join(TARGET_DIR, `${targetId}.json`)))) {
      console.warn(`  ⚠ target ${targetId}.json exists — skipped (use --force).`);
      continue;
    }
    const m = parsed.manifest;
    const questions: KvizImportQuestion[] = m.questions.map((q) => ({
      type: 'broj',
      text: q.text,
      answer: q.answer,
      min: q.min,
      max: q.max,
      step: q.step,
      unit: q.unit,
      valueType: q.valueType,
      emoji: q.emoji,
      imageFile: q.imageFile,
    }));
    const manifest: KvizPackManifest = {
      name: m.name,
      description: m.description,
      questions,
    };
    if (await writePack(targetId, manifest)) {
      await copyAssets(path.join(BROJ_DIR, id), targetId);
      console.log(`  ✓ broj pack ${id} → ${targetId} (${questions.length} pitanja)`);
    }
  }
}

async function exportBuiltinBrojBank(): Promise<void> {
  const targetId = await resolveTargetId('pogodi-broj', 'broj-');
  if (!FORCE && (await exists(path.join(TARGET_DIR, `${targetId}.json`)))) {
    console.warn(`  ⚠ ${targetId}.json exists — skipped (use --force).`);
    return;
  }
  const questions: KvizImportQuestion[] = POGODI_BROJ_QUESTIONS.map((q) => ({
    type: 'broj',
    text: q.text,
    answer: q.answer,
    min: q.min,
    max: q.max,
    step: q.step,
    unit: q.unit,
    valueType: q.valueType,
    emoji: q.emoji,
  }));
  const manifest: KvizPackManifest = {
    name: 'Pogodi broj',
    description: 'Migrirana ugrađena pitanja stare igre „Pogodi broj".',
    questions,
  };
  if (await writePack(targetId, manifest)) {
    console.log(`  ✓ built-in broj bank → ${targetId} (${questions.length} pitanja)`);
  }
}

async function main(): Promise<void> {
  console.log('Migrating legacy packs into', TARGET_DIR);
  console.log('— geo packs —');
  await migrateGeoPacks();
  console.log('— pogodi-broj packs —');
  await migrateBrojPacks();
  console.log('— built-in broj bank —');
  await exportBuiltinBrojBank();
  console.log(
    '\nDone. Verify the migrated packs in-game, then geo-packs/ and pogodi-broj-packs/ can be deleted.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
