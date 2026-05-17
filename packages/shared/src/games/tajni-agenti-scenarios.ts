import type { TajniAgentiCardType, TajniAgentiTeam } from '../types/tajni-agenti.js';

export interface TajniAgentiScenarioCard {
  word: string;
  type: TajniAgentiCardType;
}

export interface TajniAgentiScenario {
  /** Unique short code typed by the host to load this board. */
  code: string;
  name: string;
  cards: TajniAgentiScenarioCard[];
}

export interface TajniAgentiResolvedScenario {
  code: string;
  name: string;
  cards: TajniAgentiScenarioCard[];
  startingTeam: TajniAgentiTeam;
}

/**
 * Built-in scenarios — typed via a hidden input on the host's game card.
 * Each scenario must define exactly 25 cards. Distribution: 9/8/7/1
 * (whichever team has 9 cards starts). Codes are compared
 * case-insensitively; word duplicates inside a scenario are rejected.
 *
 * To add a new scenario: append an entry below, run `npm run build:shared`,
 * and restart the dev server. Codes are intentionally short + memorable.
 */
export const TAJNI_AGENTI_SCENARIOS: readonly TajniAgentiScenario[] = [
  {
    code: 'SNS',
    name: 'Probni (test)',
    cards: [
      // row 1
      { word: 'av av', type: 'red' },
      { word: 'simbol otpora', type: 'blue' },
      { word: 'mafija', type: 'red' },
      { word: 'neutralac1', type: 'neutral' },
      { word: 'borba protiv zla', type: 'blue' },
      // row 2
      { word: '24 stana', type: 'red' },
      { word: 'nada', type: 'blue' },
      { word: 'BGH2O', type: 'red' },
      { word: 'neutralac2', type: 'neutral' },
      { word: 'pobeda', type: 'blue' },
      // row 3
      { word: 'pas', type: 'red' },
      { word: 'slavija', type: 'blue' },
      { word: 'koferče', type: 'red' },
      { word: 'neutralac3', type: 'neutral' },
      { word: 'plenum', type: 'blue' },
      // row 4
      { word: 'informer', type: 'red' },
      { word: 'mjau', type: 'blue' },
      { word: 'helikopter', type: 'red' },
      { word: 'neutralac4', type: 'neutral' },
      { word: 'bicikl', type: 'blue' },
      // row 5
      { word: 'jovanjica', type: 'red' },
      { word: 'neutralac5', type: 'neutral' },
      { word: 'neutralac6', type: 'neutral' },
      { word: 'neutralac7', type: 'neutral' },
      { word: '!', type: 'assassin' },
    ],
  },
];

const TYPE_VALUES: readonly TajniAgentiCardType[] = [
  'red',
  'blue',
  'neutral',
  'assassin',
];

export type TajniAgentiScenarioValidationResult =
  | { ok: true; scenario: TajniAgentiResolvedScenario }
  | { ok: false; error: string };

/**
 * Validates a scenario (built-in or imported) and resolves the implied
 * starting team. Enforces the classic 9/8/7/1 distribution so the rest of
 * the game logic doesn't need to special-case off-balance boards.
 */
export function validateTajniAgentiScenario(
  scenario: TajniAgentiScenario
): TajniAgentiScenarioValidationResult {
  if (typeof scenario.code !== 'string' || scenario.code.trim().length === 0) {
    return { ok: false, error: 'Scenario nema kod.' };
  }
  if (!Array.isArray(scenario.cards)) {
    return { ok: false, error: 'Scenario mora imati polje "cards".' };
  }
  if (scenario.cards.length !== 25) {
    return {
      ok: false,
      error: `Scenario mora imati tačno 25 karata (dobijeno ${scenario.cards.length}).`,
    };
  }

  const seenWords = new Set<string>();
  const counts: Record<TajniAgentiCardType, number> = {
    red: 0,
    blue: 0,
    neutral: 0,
    assassin: 0,
  };

  for (let i = 0; i < scenario.cards.length; i++) {
    const card = scenario.cards[i];
    if (!card || typeof card !== 'object') {
      return { ok: false, error: `Karta ${i + 1}: nije objekat.` };
    }
    if (typeof card.word !== 'string' || card.word.trim().length === 0) {
      return { ok: false, error: `Karta ${i + 1}: prazna reč.` };
    }
    if (card.word.trim().length > 30) {
      return { ok: false, error: `Karta ${i + 1}: reč predugačka.` };
    }
    if (!TYPE_VALUES.includes(card.type)) {
      return {
        ok: false,
        error: `Karta ${i + 1}: nevažeći tip "${String(card.type)}".`,
      };
    }
    const key = card.word.trim().toLowerCase();
    if (seenWords.has(key)) {
      return { ok: false, error: `Duplikat reči: "${card.word}".` };
    }
    seenWords.add(key);
    counts[card.type]++;
  }

  if (counts.assassin !== 1) {
    return {
      ok: false,
      error: `Mora biti tačno 1 ubica (dobijeno ${counts.assassin}).`,
    };
  }
  if (counts.neutral !== 7) {
    return {
      ok: false,
      error: `Mora biti tačno 7 neutralnih (dobijeno ${counts.neutral}).`,
    };
  }
  const startingTeam: TajniAgentiTeam | null =
    counts.red === 9 && counts.blue === 8
      ? 'red'
      : counts.blue === 9 && counts.red === 8
        ? 'blue'
        : null;
  if (!startingTeam) {
    return {
      ok: false,
      error: `Raspored mora biti 9/8 (dobijeno crveni=${counts.red}, plavi=${counts.blue}).`,
    };
  }

  return {
    ok: true,
    scenario: {
      code: scenario.code.trim().toUpperCase(),
      name: scenario.name,
      cards: scenario.cards.map((c) => ({
        word: c.word.trim(),
        type: c.type,
      })),
      startingTeam,
    },
  };
}

/**
 * Look up a built-in scenario by code (case-insensitive). Returns the
 * fully validated scenario or null if the code is empty / unknown /
 * malformed. Callers wanting a distinction between "unknown code" and
 * "code matched but the scenario is invalid" should use
 * `lookupTajniAgentiScenario`.
 */
export function findTajniAgentiScenarioByCode(
  rawCode: string | null | undefined
): TajniAgentiResolvedScenario | null {
  const result = lookupTajniAgentiScenario(rawCode);
  return result.status === 'found' ? result.scenario : null;
}

export type TajniAgentiScenarioLookup =
  | { status: 'found'; scenario: TajniAgentiResolvedScenario }
  | { status: 'invalid'; code: string; error: string }
  | { status: 'not-found' };

/**
 * Like `findTajniAgentiScenarioByCode` but distinguishes between an
 * unknown code and a known-code-that-fails-validation. Used by the host
 * UI to surface the specific validation error instead of a generic
 * "unknown code" message.
 */
export function lookupTajniAgentiScenario(
  rawCode: string | null | undefined
): TajniAgentiScenarioLookup {
  if (typeof rawCode !== 'string') return { status: 'not-found' };
  const code = rawCode.trim().toUpperCase();
  if (code.length === 0) return { status: 'not-found' };
  for (const scenario of TAJNI_AGENTI_SCENARIOS) {
    if (scenario.code.trim().toUpperCase() === code) {
      const validated = validateTajniAgentiScenario(scenario);
      if (validated.ok) {
        return { status: 'found', scenario: validated.scenario };
      }
      return { status: 'invalid', code, error: validated.error };
    }
  }
  return { status: 'not-found' };
}
