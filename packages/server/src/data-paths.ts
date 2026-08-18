import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, mkdirSync, cpSync, rmSync } from 'fs';

/**
 * Central layout for the mutable, admin-editable content (question packs,
 * per-game packs, uploaded images/audio, timing overrides).
 *
 * Two modes:
 *  - **Dev / legacy** (no `DATA_DIR`): everything resolves to the repo-root
 *    folders, exactly as before. Editing writes straight into the working copy.
 *  - **Deploy** (`DATA_DIR` set, e.g. a Coolify persistent volume at `/data`):
 *    content lives on the volume so it survives image rebuilds. On first boot
 *    the baked-in defaults (`SEED_DIR`, e.g. `/app/seed`) are copied into any
 *    dir the volume doesn't have yet — so a fresh deploy ships with the bundled
 *    packs but later admin edits persist and are never clobbered.
 *
 * The pristine defaults stay available under `SEED_DIR` at all times, which is
 * what powers the admin "reset to factory" action.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `src/` and `dist/` both sit at packages/server/<dir>/, so the repo root is
// three levels up — same reference point index.ts has always used.
const REPO_ROOT = path.resolve(__dirname, '../../..');

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : null;
export const SEED_DIR = process.env.SEED_DIR
  ? path.resolve(process.env.SEED_DIR)
  : null;

/** True when content is served off a persistent volume seeded from defaults. */
export const isDeployDataMode = !!(DATA_DIR && SEED_DIR);

/** Managed top-level content directory names (all live side by side). */
export const CONTENT_DIR_NAMES = [
  'question-packs',
  'ko-sam-ja-packs',
  'tajni-agenti-packs',
  'gluvo-doba-packs',
  'spijun-packs',
  'asocijacije-packs',
  'fibbage-packs',
  // Osvajanje: <id>.json manifest + <id>/ folder sa otpremljenom slikom mape.
  'bitka-maps',
] as const;

export const TIMING_FILE_NAME = 'timing-config.json';
export const QUIZ_FEEDBACK_FILE_NAME = 'quiz-feedback.json';

/**
 * Resolve a content directory. An explicit per-dir env override always wins;
 * otherwise `DATA_DIR/<name>` in deploy mode, else the repo-root copy.
 */
export function resolveContentDir(name: string, envOverride?: string): string {
  if (envOverride) return path.resolve(envOverride);
  if (DATA_DIR) return path.join(DATA_DIR, name);
  return path.resolve(REPO_ROOT, name);
}

/** Resolve the timing-overrides JSON file, same precedence as content dirs. */
export function resolveTimingFile(envOverride?: string): string {
  if (envOverride) return path.resolve(envOverride);
  if (DATA_DIR) return path.join(DATA_DIR, TIMING_FILE_NAME);
  return path.resolve(REPO_ROOT, TIMING_FILE_NAME);
}

/**
 * Resolve the player quiz-feedback JSON file (reports + ratings collected
 * in-game). Same precedence as the timing file; gitignored in dev.
 */
export function resolveQuizFeedbackFile(envOverride?: string): string {
  if (envOverride) return path.resolve(envOverride);
  if (DATA_DIR) return path.join(DATA_DIR, QUIZ_FEEDBACK_FILE_NAME);
  return path.resolve(REPO_ROOT, QUIZ_FEEDBACK_FILE_NAME);
}

function isEmptyOrMissing(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0;
  } catch {
    return true; // ENOENT etc.
  }
}

/**
 * First-boot seeding: copy baked-in defaults into any content dir the volume
 * doesn't already have. Only dirs that are missing or empty are touched, so
 * existing admin edits are never overwritten. No-op outside deploy mode.
 */
export function seedDataDirs(): void {
  if (!isDeployDataMode) return;
  mkdirSync(DATA_DIR!, { recursive: true });
  for (const name of CONTENT_DIR_NAMES) {
    const source = path.join(SEED_DIR!, name);
    const target = path.join(DATA_DIR!, name);
    if (!existsSync(source)) continue;
    if (isEmptyOrMissing(target)) {
      cpSync(source, target, { recursive: true });
      console.log(`[data] seeded ${name} from defaults`);
    }
  }
}

/**
 * Factory reset: replace every managed content dir with the baked-in defaults,
 * discarding all admin edits (packs, uploaded images/audio, custom maps), and
 * delete the timing-overrides file (its default is "no overrides"). Deploy mode
 * only — in dev this would wipe the tracked working copy, so it throws instead.
 */
export function resetDataToDefaults(timingFile: string): void {
  if (!isDeployDataMode) {
    throw new Error(
      'Reset je dostupan samo u deploy modu (DATA_DIR + SEED_DIR nisu postavljeni).'
    );
  }
  for (const name of CONTENT_DIR_NAMES) {
    const source = path.join(SEED_DIR!, name);
    const target = path.join(DATA_DIR!, name);
    rmSync(target, { recursive: true, force: true });
    if (existsSync(source)) {
      cpSync(source, target, { recursive: true });
    } else {
      mkdirSync(target, { recursive: true });
    }
  }
  rmSync(timingFile, { force: true });
}
