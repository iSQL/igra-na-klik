import { readFileSync } from 'fs';
import { writeJsonAtomic } from '../admin/admin-common.js';

/**
 * Server-side store for player-submitted quiz feedback: per-question "this is
 * wrong" reports and 1–5 star ratings, collected live during a game via the
 * `quiz:feedback` player action. Backed by a single JSON file
 * (`quiz-feedback.json`, next to the timing config; override with
 * `QUIZ_FEEDBACK_FILE`). Loaded once and cached; every record mutates the cache
 * and schedules a debounced atomic rewrite so a burst of votes is one write.
 *
 * Records are keyed by a stable, source-relative question key
 * (`pack:<packId>:<index>` for file packs, `bank:<index>` for the built-in
 * bank) so the admin editor can join feedback back to a pack's questions by
 * position. The key is built by the quiz module from the runtime question — see
 * QuizGameModule.registerFeedbackKeys.
 */

export interface QuestionFeedback {
  /** How many players flagged the question as wrong/broken. */
  reports: number;
  /** Number of 1–5 ratings received. */
  ratingCount: number;
  /** Sum of all ratings (average = ratingSum / ratingCount). */
  ratingSum: number;
  /** Epoch ms of the most recent report, if any. */
  lastReportAt?: number;
  /** Epoch ms of the most recent rating, if any. */
  lastRatingAt?: number;
}

export type QuizFeedbackMap = Record<string, QuestionFeedback>;

let feedbackFile: string | null = null;
let cache: QuizFeedbackMap | null = null;
let writeTimer: NodeJS.Timeout | null = null;

const WRITE_DEBOUNCE_MS = 1500;

/** Point the store at its JSON file (called once from the server bootstrap). */
export function initQuizFeedback(filePath: string): void {
  feedbackFile = filePath;
  cache = null;
  load();
}

function load(): QuizFeedbackMap {
  if (cache) return cache;
  if (!feedbackFile) {
    cache = {};
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(feedbackFile, 'utf-8'));
    cache = sanitize(raw);
  } catch {
    // Missing file / bad JSON → empty.
    cache = {};
  }
  return cache;
}

/** Keep only well-formed records so a hand-edited file can't crash callers. */
function sanitize(raw: unknown): QuizFeedbackMap {
  const out: QuizFeedbackMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const v = val as Record<string, unknown>;
    const reports = num(v.reports);
    const ratingCount = num(v.ratingCount);
    const ratingSum = num(v.ratingSum);
    if (reports === 0 && ratingCount === 0) continue;
    out[key] = {
      reports,
      ratingCount,
      ratingSum,
      ...(typeof v.lastReportAt === 'number' ? { lastReportAt: v.lastReportAt } : {}),
      ...(typeof v.lastRatingAt === 'number' ? { lastRatingAt: v.lastRatingAt } : {}),
    };
  }
  return out;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function scheduleWrite(): void {
  if (!feedbackFile || writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const snapshot = cache ?? {};
    void writeJsonAtomic(feedbackFile!, snapshot).catch((err) => {
      console.error('[quiz-feedback] write failed:', err);
    });
  }, WRITE_DEBOUNCE_MS);
}

function entry(key: string): QuestionFeedback {
  const map = load();
  let e = map[key];
  if (!e) {
    e = { reports: 0, ratingCount: 0, ratingSum: 0 };
    map[key] = e;
  }
  return e;
}

/**
 * Record one player's feedback for a question. `report` flags it as wrong;
 * `rating` (1–5) adds to the running average. Either or both may be present.
 * No-op if the store isn't initialized.
 */
export function recordQuizFeedback(
  key: string,
  input: { report?: boolean; rating?: number }
): void {
  if (!feedbackFile || !key) return;
  let changed = false;
  const e = entry(key);
  if (input.report) {
    e.reports += 1;
    e.lastReportAt = Date.now();
    changed = true;
  }
  if (
    typeof input.rating === 'number' &&
    Number.isInteger(input.rating) &&
    input.rating >= 1 &&
    input.rating <= 5
  ) {
    e.ratingCount += 1;
    e.ratingSum += input.rating;
    e.lastRatingAt = Date.now();
    changed = true;
  }
  if (changed) scheduleWrite();
}

/** The full feedback map (for the admin editor). */
export function getQuizFeedback(): QuizFeedbackMap {
  return load();
}

/** Clear feedback for one question key (admin "mark resolved"). */
export function clearQuizFeedback(key: string): boolean {
  const map = load();
  if (!map[key]) return false;
  delete map[key];
  scheduleWrite();
  return true;
}
