/**
 * Admin-configurable "wait" timings (scope B): the results / leaderboard /
 * intro / narration phases that are pure pauses, NOT the active-input timers
 * (answering, drawing, voting) which are gameplay balance and stay in code.
 *
 * This module is the single description of which fields are tunable, their
 * Serbian labels and their bounds. The `def` values MIRROR the server-side
 * `*_DURATION` constants — they drive only the admin UI (placeholder / shown
 * value when there is no override). At runtime each game module still falls
 * back to its own constant, so an out-of-sync default here can never change
 * gameplay; it would only mislabel the admin form.
 *
 * Values are whole seconds. Keys match the constant names in each game module
 * so the wiring reads `this.timings.SHOWING_RESULTS_DURATION ?? CONST`.
 */

export interface TimingFieldDef {
  /** Matches the server constant name, e.g. 'SHOWING_RESULTS_DURATION'. */
  key: string;
  /** Serbian label shown in the admin editor. */
  label: string;
  min: number;
  max: number;
  /** Mirrors the server default (admin display only — see file header). */
  def: number;
}

export interface GameTimingDef {
  /** Registry gameId (module.gameId), e.g. 'ko-sam-ja'. */
  gameId: string;
  /** Serbian game name for the admin editor heading. */
  gameName: string;
  fields: TimingFieldDef[];
}

/** gameId → (constant key → seconds). Only overridden fields are stored. */
export type TimingOverrides = Record<string, Record<string, number>>;

export const GAME_TIMING_DEFS: readonly GameTimingDef[] = [
  {
    gameId: 'quiz',
    gameName: 'Kviz',
    fields: [
      { key: 'SHOWING_QUESTION_DURATION', label: 'Odbrojavanje pre pitanja', min: 2, max: 30, def: 5 },
      { key: 'SHOWING_RESULTS_DURATION', label: 'Prikaz rezultata', min: 2, max: 30, def: 5 },
      { key: 'RICH_RESULTS_DURATION', label: 'Prikaz rezultata (geo/broj)', min: 2, max: 40, def: 8 },
      { key: 'LEADERBOARD_DURATION', label: 'Rang lista', min: 2, max: 30, def: 4 },
    ],
  },
  {
    gameId: 'fibbage',
    gameName: 'Lažov',
    fields: [
      { key: 'SHOWING_QUESTION_DURATION', label: 'Prikaz pitanja', min: 2, max: 30, def: 5 },
      { key: 'SHOWING_RESULTS_DURATION', label: 'Prikaz rezultata', min: 2, max: 40, def: 8 },
      { key: 'LEADERBOARD_DURATION', label: 'Rang lista', min: 2, max: 30, def: 5 },
    ],
  },
  {
    gameId: 'ko-sam-ja',
    gameName: 'Ko sam ja',
    fields: [
      { key: 'SHOWING_QUESTION_DURATION', label: 'Prikaz pitanja', min: 2, max: 30, def: 4 },
      { key: 'SHOWING_RESULTS_DURATION', label: 'Rezultati + rang lista', min: 2, max: 40, def: 10 },
    ],
  },
  {
    gameId: 'draw-guess',
    gameName: 'Crtaj i pogodi',
    fields: [
      { key: 'TURN_RESULTS_DURATION', label: 'Rezultati poteza', min: 2, max: 30, def: 5 },
      { key: 'LEADERBOARD_DURATION', label: 'Rang lista', min: 2, max: 30, def: 5 },
    ],
  },
  {
    gameId: 'fake-artist',
    gameName: 'Lažni umetnik',
    fields: [
      { key: 'REVEAL_ROLE_DURATION', label: 'Prikaz uloge', min: 2, max: 30, def: 6 },
      { key: 'RESULTS_DURATION', label: 'Prikaz rezultata', min: 2, max: 40, def: 12 },
    ],
  },
  {
    gameId: 'dve-istine-i-laz',
    gameName: 'Dve istine i laž',
    fields: [
      { key: 'SHOWING_RESULTS_DURATION', label: 'Prikaz rezultata', min: 2, max: 40, def: 8 },
    ],
  },
  {
    gameId: 'ko-bi-pre',
    gameName: 'Ko bi pre',
    fields: [
      { key: 'SHOWING_RESULTS_DURATION', label: 'Prikaz rezultata', min: 2, max: 40, def: 8 },
    ],
  },
  {
    gameId: 'asocijacije',
    gameName: 'Asocijacije',
    fields: [
      { key: 'BOARD_RESULTS_DURATION', label: 'Prikaz table na kraju', min: 3, max: 40, def: 10 },
      { key: 'LEADERBOARD_DURATION', label: 'Rang lista', min: 2, max: 30, def: 6 },
    ],
  },
  {
    gameId: 'slozilica',
    gameName: 'Složilica',
    fields: [
      { key: 'NAJAVA_DURATION', label: 'Odbrojavanje pre slova', min: 2, max: 15, def: 4 },
      { key: 'REZULTATI_DURATION', label: 'Prikaz rezultata runde', min: 4, max: 40, def: 12 },
    ],
  },
  {
    gameId: 'osvajanje',
    gameName: 'Osvajanje',
    fields: [
      { key: 'UVOD_DURATION', label: 'Uvod (upoznavanje mape)', min: 3, max: 20, def: 7 },
      { key: 'PITANJE_NAJAVA_DURATION', label: 'Čitanje pitanja pre odgovaranja', min: 2, max: 12, def: 4 },
      // Sme i 1 s: tačan odgovor ostaje na ekranu i kroz fazu biranja.
      { key: 'REZULTAT_DURATION', label: 'Prikaz rezultata pitanja', min: 1, max: 20, def: 3 },
      { key: 'DUEL_REZULTAT_DURATION', label: 'Prikaz ishoda napada', min: 3, max: 20, def: 6 },
      { key: 'LEADERBOARD_DURATION', label: 'Rang lista na kraju', min: 4, max: 40, def: 14 },
    ],
  },
  {
    gameId: 'penali',
    gameName: 'Penali',
    fields: [
      { key: 'INTRO_DURATION', label: 'Najava dvoboja', min: 2, max: 15, def: 4 },
      { key: 'SHOT_DURATION', label: 'Snimak udarca', min: 4, max: 20, def: 7 },
      { key: 'LEADERBOARD_DURATION', label: 'Rang lista', min: 2, max: 30, def: 6 },
    ],
  },
  {
    gameId: 'tajni-agenti',
    gameName: 'Tajni agenti',
    fields: [
      { key: 'TURN_RESULTS_DURATION', label: 'Rezultati poteza', min: 2, max: 30, def: 5 },
    ],
  },
  {
    gameId: 'bolji-zivot',
    gameName: 'Zavet',
    fields: [
      { key: 'PEEKING_DURATION', label: 'Početno gledanje 2 karte', min: 10, max: 60, def: 20 },
      { key: 'PEEK_SHOW_DURATION', label: 'Prikaz virnute karte', min: 2, max: 10, def: 4 },
      { key: 'RACIJA_SHOW_DURATION', label: 'Grom (prikaz otkrivenih)', min: 3, max: 20, def: 7 },
      { key: 'REVEAL_DURATION', label: 'Otkrivanje kraja runde', min: 5, max: 60, def: 15 },
      { key: 'FINAL_LEADERBOARD_DURATION', label: 'Završna rang lista', min: 3, max: 40, def: 10 },
    ],
  },
  {
    gameId: 'hot-potato',
    gameName: 'Vruć krompir',
    fields: [
      { key: 'INTRO_DURATION', label: 'Uvod runde', min: 1, max: 20, def: 3 },
      { key: 'EXPLODED_DURATION', label: 'Prikaz eksplozije', min: 2, max: 20, def: 4 },
      { key: 'FINAL_LEADERBOARD_DURATION', label: 'Završna rang lista', min: 2, max: 40, def: 10 },
    ],
  },
  {
    gameId: 'spijun',
    gameName: 'Špijun',
    fields: [
      { key: 'REVEAL_ROLE_DURATION', label: 'Prikaz uloge', min: 3, max: 30, def: 8 },
      { key: 'RESULTS_DURATION', label: 'Prikaz rezultata', min: 5, max: 60, def: 14 },
    ],
  },
  {
    gameId: 'gluvo-doba',
    gameName: 'Gluvo doba',
    fields: [
      { key: 'PODELA_ULOGA_DURATION', label: 'Podela uloga', min: 5, max: 60, def: 15 },
      { key: 'ZORA_DURATION', label: 'Zora (otkrivanje noći)', min: 5, max: 60, def: 15 },
      { key: 'PRESUDA_DURATION', label: 'Presuda (rezultat glasanja)', min: 5, max: 60, def: 12 },
      { key: 'KRAJ_DURATION', label: 'Kraj (otkrivanje uloga)', min: 5, max: 120, def: 30 },
    ],
  },
];

/**
 * Resolve one game's admin overrides into a clamped `{ key: seconds }` map.
 * Only fields that carry a valid override are present — callers apply their
 * own constant as the fallback (`this.timings.KEY ?? CONST`).
 */
export function resolveGameTimings(
  overrides: TimingOverrides | undefined,
  gameId: string
): Record<string, number> {
  const def = GAME_TIMING_DEFS.find((g) => g.gameId === gameId);
  const out: Record<string, number> = {};
  if (!def) return out;
  const ov = overrides?.[gameId] ?? {};
  for (const f of def.fields) {
    const v = ov[f.key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[f.key] = Math.min(f.max, Math.max(f.min, Math.round(v)));
    }
  }
  return out;
}

/**
 * Validate + normalize an overrides object from the admin PUT. Unknown
 * games/fields are dropped, values are clamped to each field's bounds, and
 * values equal to the default are dropped so the persisted file stays minimal.
 */
export function parseTimingOverrides(
  input: unknown
):
  | { ok: true; overrides: TimingOverrides }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Config mora biti objekat.' };
  }
  const src = input as Record<string, unknown>;
  const out: TimingOverrides = {};
  for (const def of GAME_TIMING_DEFS) {
    const g = src[def.gameId];
    if (g == null) continue;
    if (typeof g !== 'object' || Array.isArray(g)) {
      return { ok: false, error: `"${def.gameId}" mora biti objekat.` };
    }
    const gsrc = g as Record<string, unknown>;
    const gout: Record<string, number> = {};
    for (const f of def.fields) {
      const v = gsrc[f.key];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return {
          ok: false,
          error: `${def.gameName} · ${f.label}: mora biti broj.`,
        };
      }
      const clamped = Math.min(f.max, Math.max(f.min, Math.round(v)));
      if (clamped !== f.def) gout[f.key] = clamped;
    }
    if (Object.keys(gout).length > 0) out[def.gameId] = gout;
  }
  return { ok: true, overrides: out };
}
