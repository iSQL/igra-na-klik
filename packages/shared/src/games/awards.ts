// Utešne diplome ("consolation titles") — a small cross-game framework that
// hands every player a funny end-of-game diploma so nobody (least of all the
// loser) leaves empty-handed. In-game content is Serbian by design, so all
// titles live here as plain Serbian strings — there is no EN/SR dictionary.
//
// Flow: game modules (and a generic score-based layer in GameManager) emit
// `DiplomaCandidate`s; `allocateDiplomas` resolves them into one `PlayerAward`
// per player. The catalog is the single source of truth for the display text,
// so host and controller render identical diplomas.

export type AwardTone = 'positive' | 'shame' | 'neutral';

/** A resolved diploma handed to a single player and rendered on TV + phone. */
export interface PlayerAward {
  playerId: string;
  awardId: string;
  title: string;
  subtitle?: string;
  emoji: string;
  tone: AwardTone;
}

/** Catalog entry — static display text for one diploma id. */
export interface DiplomaDef {
  id: string;
  title: string;
  emoji: string;
  tone: AwardTone;
  /** Default subtitle when a candidate doesn't supply a computed one. */
  subtitle?: string;
}

/**
 * One award a player *could* receive. Higher `priority` wins when a player or a
 * title is contested. `subtitle` overrides the catalog default (e.g. a computed
 * "prosečno vreme 8.2s").
 */
export interface DiplomaCandidate {
  playerId: string;
  awardId: string;
  priority: number;
  subtitle?: string;
}

export const DIPLOMA_CATALOG: Record<string, DiplomaDef> = {
  // Positive / neutral
  sampion: {
    id: 'sampion',
    title: 'Šampion',
    emoji: '🏆',
    tone: 'positive',
    subtitle: 'Neprikosnoveni pobednik',
  },
  'za-dlaku': {
    id: 'za-dlaku',
    title: 'Za dlaku',
    emoji: '🥈',
    tone: 'neutral',
    subtitle: 'Malo je falilo do vrha',
  },
  sigurica: {
    id: 'sigurica',
    title: 'Sigurica',
    emoji: '🎯',
    tone: 'positive',
    subtitle: 'Spor ali gotovo uvek tačan',
  },
  // Shame
  'nula-sedam': {
    id: 'nula-sedam',
    title: 'Nula-sedam',
    emoji: '🕵️',
    tone: 'shame',
    subtitle: 'Tajni agent sa nula bodova',
  },
  'najbrzi-prst': {
    id: 'najbrzi-prst',
    title: 'Najbrži prst, najgori odgovori',
    emoji: '⚡',
    tone: 'shame',
    subtitle: 'Brz na tasteru, spor na tačnosti',
  },
  puz: {
    id: 'puz',
    title: 'Puž',
    emoji: '🐌',
    tone: 'shame',
    subtitle: 'Misli sporo ali temeljno',
  },
  'gospodar-panike': {
    id: 'gospodar-panike',
    title: 'Gospodar panike',
    emoji: '😱',
    tone: 'shame',
    subtitle: 'Više promašaja nego pogodaka',
  },
  kamikaza: {
    id: 'kamikaza',
    title: 'Kamikaza',
    emoji: '💥',
    tone: 'shame',
    subtitle: 'Uvek odgovara, retko pogodi',
  },
  // Složilica
  slovoslagac: {
    id: 'slovoslagac',
    title: 'Slovoslagač',
    emoji: '🔤',
    tone: 'positive',
    subtitle: 'Najduža reč u partiji',
  },
  'hodajuci-recnik': {
    id: 'hodajuci-recnik',
    title: 'Hodajući rečnik',
    emoji: '📖',
    tone: 'positive',
    subtitle: 'Najviše pronađenih reči',
  },
  'prazan-papir': {
    id: 'prazan-papir',
    title: 'Prazan papir',
    emoji: '📄',
    tone: 'shame',
    subtitle: 'Runde bez ijedne reči',
  },
  // Osvajanje
  vojvoda: {
    id: 'vojvoda',
    title: 'Vojvoda',
    emoji: '⚔️',
    tone: 'positive',
    subtitle: 'Najviše osvojenih teritorija',
  },
  zidar: {
    id: 'zidar',
    title: 'Zidar',
    emoji: '🧱',
    tone: 'positive',
    subtitle: 'Zamak koji se ne da',
  },
  'gost-u-svojoj-zemlji': {
    id: 'gost-u-svojoj-zemlji',
    title: 'Gost u svojoj zemlji',
    emoji: '🚪',
    tone: 'shame',
    subtitle: 'Ni osvojio, ni odbranio',
  },
  // Penali
  'zlatna-rukavica': {
    id: 'zlatna-rukavica',
    title: 'Zlatna rukavica',
    emoji: '🧤',
    tone: 'positive',
    subtitle: 'Najviše odbrana na golu',
  },
  snajperista: {
    id: 'snajperista',
    title: 'Snajperista',
    emoji: '🎯',
    tone: 'positive',
    subtitle: 'Golovi tačno u ćošak',
  },
  'u-tribine': {
    id: 'u-tribine',
    title: 'U tribine',
    emoji: '🚀',
    tone: 'shame',
    subtitle: 'Lopta se još nije vratila',
  },
  'statue-of-liberty': {
    id: 'statue-of-liberty',
    title: 'Statua',
    emoji: '🗿',
    tone: 'shame',
    subtitle: 'Golman koji se nije ni pomerio',
  },
  // Neutral fillers — guarantee everyone gets a diploma
  'dusa-drustva': {
    id: 'dusa-drustva',
    title: 'Duša društva',
    emoji: '🎉',
    tone: 'neutral',
    subtitle: 'Bez tebe ne bi bilo isto',
  },
  'ucesnik-godine': {
    id: 'ucesnik-godine',
    title: 'Učesnik godine',
    emoji: '🎖️',
    tone: 'neutral',
    subtitle: 'Hrabro do samog kraja',
  },
  'tamni-konj': {
    id: 'tamni-konj',
    title: 'Tamni konj',
    emoji: '🐎',
    tone: 'neutral',
    subtitle: 'Niko te nije očekivao',
  },
  vezbanje: {
    id: 'vezbanje',
    title: 'Ide se na trening',
    emoji: '💪',
    tone: 'neutral',
    subtitle: 'Sledeći put ide bolje',
  },
};

/** Filler titles cycled through for players who earned no specific diploma. */
export const FILLER_AWARD_IDS = [
  'dusa-drustva',
  'tamni-konj',
  'ucesnik-godine',
  'vezbanje',
];

/**
 * Generic score-only diplomas that work for ANY game (from `finalScores`
 * alone): a champion for the top scorer and a consolation for the tail.
 * Returns [] when scores don't rank players (team games tie everyone), so the
 * caller can skip diplomas entirely in that case.
 */
export function genericScoreCandidates(
  finalScores: { playerId: string; score: number }[],
  lowerScoreWins: boolean
): DiplomaCandidate[] {
  if (finalScores.length === 0) return [];
  const scoresVary = finalScores.some((s) => s.score !== finalScores[0].score);
  if (!scoresVary) return [];

  const sorted = [...finalScores].sort((a, b) =>
    lowerScoreWins ? a.score - b.score : b.score - a.score
  );
  const candidates: DiplomaCandidate[] = [];
  const topScore = sorted[0].score;

  // Every player sharing the best score is a champion (priority high so the
  // winner is always locked into a positive diploma before any shame title).
  for (const s of sorted) {
    if (s.score === topScore) {
      candidates.push({ playerId: s.playerId, awardId: 'sampion', priority: 100 });
    }
  }

  // Runner-up (distinct from the winners) — a gentle "za dlaku".
  const runnerUp = sorted.find((s) => s.score !== topScore);
  if (runnerUp) {
    candidates.push({
      playerId: runnerUp.playerId,
      awardId: 'za-dlaku',
      priority: 12,
    });
  }

  // Tail: a zero-score player gets the "nula-sedam" joke; otherwise the
  // filler pass covers them.
  const last = sorted[sorted.length - 1];
  if (last.score === 0 && last.score !== topScore) {
    candidates.push({
      playerId: last.playerId,
      awardId: 'nula-sedam',
      priority: 15,
    });
  }

  return candidates;
}

/**
 * Resolve candidate diplomas into exactly one `PlayerAward` per player.
 *
 * - Candidates are assigned greedily by descending priority.
 * - Each player receives at most one diploma; each (non-filler) title is used
 *   at most once, so the board reads as distinct superlatives.
 * - `positiveOnlyPlayerIds` (e.g. the winner) never receive a shame diploma.
 * - Players left over get a rotating neutral filler, guaranteeing full coverage.
 */
export function allocateDiplomas(
  candidates: DiplomaCandidate[],
  playerIds: string[],
  opts?: { positiveOnlyPlayerIds?: string[] }
): PlayerAward[] {
  const positiveOnly = new Set(opts?.positiveOnlyPlayerIds ?? []);
  const assigned = new Map<string, PlayerAward>();
  const usedTitles = new Set<string>();

  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  for (const c of sorted) {
    if (assigned.has(c.playerId)) continue;
    if (usedTitles.has(c.awardId)) continue;
    const def = DIPLOMA_CATALOG[c.awardId];
    if (!def) continue;
    if (def.tone === 'shame' && positiveOnly.has(c.playerId)) continue;
    assigned.set(c.playerId, {
      playerId: c.playerId,
      awardId: def.id,
      title: def.title,
      subtitle: c.subtitle ?? def.subtitle,
      emoji: def.emoji,
      tone: def.tone,
    });
    usedTitles.add(def.id);
  }

  // Filler pass — cover anyone still without a diploma.
  let fillerIdx = 0;
  for (const playerId of playerIds) {
    if (assigned.has(playerId)) continue;
    const fillerId = FILLER_AWARD_IDS[fillerIdx % FILLER_AWARD_IDS.length];
    fillerIdx++;
    const def = DIPLOMA_CATALOG[fillerId];
    assigned.set(playerId, {
      playerId,
      awardId: def.id,
      title: def.title,
      subtitle: def.subtitle,
      emoji: def.emoji,
      tone: def.tone,
    });
  }

  // Preserve the incoming player order for a stable render.
  return playerIds
    .map((id) => assigned.get(id))
    .filter((a): a is PlayerAward => a !== undefined);
}
