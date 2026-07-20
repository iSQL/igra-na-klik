// Validator + helpers for Asocijacije puzzle packs. Mirrors the lax-read /
// strict-visible policy of the other content validators: `parseAsocijacijePack`
// returns a typed pack or an error string, and `summarizeAsocijacijePack`
// reports whether it is fully in-game valid without throwing.

import type {
  AsocijacijeColumn,
  AsocijacijeField,
  AsocijacijePack,
  AsocijacijePackSummary,
  AsocijacijePuzzle,
} from '../types/asocijacije.js';
import {
  ASOCIJACIJE_COLUMNS,
  ASOCIJACIJE_FIELDS_PER_COLUMN,
} from '../types/asocijacije.js';

export interface ParseAsocijacijeResult {
  pack: AsocijacijePack | null;
  error: string | null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseField(raw: unknown, where: string): AsocijacijeField | string {
  if (!raw || typeof raw !== 'object') return `${where}: polje mora biti objekat`;
  const r = raw as Record<string, unknown>;
  const word = str(r.word);
  if (!word) return `${where}: nedostaje "word"`;
  const field: AsocijacijeField = { word };

  const question = str(r.question);
  if (question) field.question = question;

  if (r.wrongOptions !== undefined) {
    if (!Array.isArray(r.wrongOptions)) {
      return `${where}: "wrongOptions" mora biti niz`;
    }
    const opts = r.wrongOptions.map(str).filter(Boolean);
    // The correct answer must not also appear among the wrong options.
    const clean = opts.filter(
      (o) => o.toLowerCase() !== word.toLowerCase()
    );
    if (clean.length > 3) {
      return `${where}: najviše 3 pogrešna odgovora`;
    }
    if (clean.length > 0) field.wrongOptions = clean;
  }

  // A question without any wrong option can't form a multiple-choice → drop
  // the question so the field silently degrades to klasik-only.
  if (field.question && !field.wrongOptions) {
    delete field.question;
  }
  return field;
}

function parseColumn(raw: unknown, where: string): AsocijacijeColumn | string {
  if (!raw || typeof raw !== 'object') return `${where}: kolona mora biti objekat`;
  const r = raw as Record<string, unknown>;
  const solution = str(r.solution);
  if (!solution) return `${where}: nedostaje "solution"`;
  if (!Array.isArray(r.fields) || r.fields.length !== ASOCIJACIJE_FIELDS_PER_COLUMN) {
    return `${where}: potrebno je tačno ${ASOCIJACIJE_FIELDS_PER_COLUMN} polja`;
  }
  const fields: AsocijacijeField[] = [];
  for (let i = 0; i < r.fields.length; i++) {
    const f = parseField(r.fields[i], `${where} · polje ${i + 1}`);
    if (typeof f === 'string') return f;
    fields.push(f);
  }
  const col: AsocijacijeColumn = { solution, fields };
  if (Array.isArray(r.acceptSolution)) {
    const acc = r.acceptSolution.map(str).filter(Boolean);
    if (acc.length) col.acceptSolution = acc;
  }
  return col;
}

function parsePuzzle(raw: unknown, where: string): AsocijacijePuzzle | string {
  if (!raw || typeof raw !== 'object') return `${where}: slagalica mora biti objekat`;
  const r = raw as Record<string, unknown>;
  const finalSolution = str(r.finalSolution);
  if (!finalSolution) return `${where}: nedostaje "finalSolution"`;
  if (!Array.isArray(r.columns) || r.columns.length !== ASOCIJACIJE_COLUMNS) {
    return `${where}: potrebno je tačno ${ASOCIJACIJE_COLUMNS} kolone`;
  }
  const columns: AsocijacijeColumn[] = [];
  for (let i = 0; i < r.columns.length; i++) {
    const c = parseColumn(r.columns[i], `${where} · kolona ${i + 1}`);
    if (typeof c === 'string') return c;
    columns.push(c);
  }
  const puzzle: AsocijacijePuzzle = { columns, finalSolution };
  if (Array.isArray(r.acceptFinal)) {
    const acc = r.acceptFinal.map(str).filter(Boolean);
    if (acc.length) puzzle.acceptFinal = acc;
  }
  return puzzle;
}

/**
 * Parse a raw pack object (or JSON-ish structure). Accepts either the full
 * `{ name, description?, puzzles: [...] }` manifest or a bare array of puzzles.
 */
export function parseAsocijacijePack(
  input: unknown,
  opts: { id?: string; allowEmpty?: boolean } = {}
): ParseAsocijacijeResult {
  let obj = input;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return { pack: null, error: 'Neispravan JSON' };
    }
  }

  let name = '';
  let description = '';
  let puzzlesRaw: unknown;

  if (Array.isArray(obj)) {
    puzzlesRaw = obj;
  } else if (obj && typeof obj === 'object') {
    const r = obj as Record<string, unknown>;
    name = str(r.name);
    description = str(r.description);
    puzzlesRaw = r.puzzles;
  } else {
    return { pack: null, error: 'Paket mora biti objekat ili niz slagalica' };
  }

  if (!Array.isArray(puzzlesRaw)) {
    return { pack: null, error: 'Nedostaje niz "puzzles"' };
  }
  if (puzzlesRaw.length === 0 && !opts.allowEmpty) {
    return { pack: null, error: 'Paket nema nijednu slagalicu' };
  }

  const puzzles: AsocijacijePuzzle[] = [];
  for (let i = 0; i < puzzlesRaw.length; i++) {
    const p = parsePuzzle(puzzlesRaw[i], `Slagalica ${i + 1}`);
    if (typeof p === 'string') return { pack: null, error: p };
    puzzles.push(p);
  }

  return {
    pack: {
      id: opts.id ?? '',
      name: name || opts.id || 'Asocijacije',
      description: description || undefined,
      puzzles,
    },
    error: null,
  };
}

/** A field is kviz-playable when it has a question with at least one wrong option. */
export function isKvizCapableField(f: AsocijacijeField): boolean {
  return !!f.question && !!f.wrongOptions && f.wrongOptions.length > 0;
}

/** A puzzle is kviz-playable when every field has a usable question. */
export function isKvizCapablePuzzle(p: AsocijacijePuzzle): boolean {
  return p.columns.every((c) => c.fields.every(isKvizCapableField));
}

export function countKvizPuzzles(pack: AsocijacijePack): number {
  return pack.puzzles.filter(isKvizCapablePuzzle).length;
}

/** Build the answer-free summary used by the pack-list API + game-select. */
export function summarizeAsocijacijePack(
  id: string,
  input: unknown
): AsocijacijePackSummary {
  const { pack, error } = parseAsocijacijePack(input, { id });
  if (!pack) {
    return {
      id,
      name: id,
      puzzleCount: 0,
      kvizPuzzleCount: 0,
      visibleInGame: false,
      error: error ?? 'Nevažeći paket',
    };
  }
  return {
    id,
    name: pack.name,
    description: pack.description,
    puzzleCount: pack.puzzles.length,
    kvizPuzzleCount: countKvizPuzzles(pack),
    visibleInGame: pack.puzzles.length > 0,
  };
}
