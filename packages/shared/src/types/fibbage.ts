export interface FibbageQuestion {
  id: string;
  text: string;
  answer: string;
  category?: string;
  /**
   * Extra spellings that also count as the player having typed the truth
   * (auto-find). The canonical `answer` always counts; these cover synonyms
   * and number/word variants. Never leaves the server.
   */
  accept?: string[];
}

/** Public question — sent to clients without revealing the answer. */
export type FibbageQuestionPublic = Omit<FibbageQuestion, 'answer'>;

export interface FibbageAnswerOptionPublic {
  id: string;
  text: string;
}

export interface FibbageVoteTally {
  optionId: string;
  voterPlayerIds: string[];
}

/**
 * One option as shown on the reveal screen. Unlike `FibbageAnswerOptionPublic`
 * (voting phase) this carries the authors — every lie is attributed, including
 * the ones nobody fell for, because "who wrote THAT?" is half the payoff.
 */
export interface FibbageRevealOption {
  id: string;
  text: string;
  isReal: boolean;
  /** Empty for the real answer; more than one when identical lies merged. */
  authorPlayerIds: string[];
  authorNames: string[];
  /** Who voted for this option. */
  voterPlayerIds: string[];
  /** Points this option earned its author(s) — 0 for the real answer. */
  pointsEarned: number;
}

export interface FibbageFoolEntry {
  optionId: string;
  optionText: string;
  fakerPlayerIds: string[];
  fakerNames: string[];
  fooledPlayerNames: string[];
}

export interface FibbageResultEntry {
  playerId: string;
  foundTruth: boolean;
  fooledCount: number;
  roundScore: number;
  /**
   * False when the player let the writing phase run out. Such a player still
   * votes but earns no truth bonus — otherwise sitting out is the strongest
   * play in the game.
   */
  wroteLie: boolean;
  /** True when the truth bonus was withheld because `wroteLie` is false. */
  truthBonusWithheld: boolean;
}

export interface FibbageResultData {
  question: FibbageQuestionPublic;
  realAnswer: string;
  realOptionId: string;
  /**
   * Reveal order, already sorted by the module: lies nobody picked first,
   * then lies by rising vote count, with the real answer last. Both the TV
   * and the hostless phone screen stagger their animation over this order,
   * so the truth always lands as the punchline.
   */
  revealOptions: FibbageRevealOption[];
  fools: FibbageFoolEntry[];
  results: FibbageResultEntry[];
}

export interface FibbageLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
  /** Points gained in the just-finished round — shown as "+N" beside the total. */
  roundScore?: number;
}

export const FIBBAGE_MAX_ANSWER_LENGTH = 80;

/**
 * Serbian plural for "glas" (vote): 1 glas, 2–4 glasa, 5+ glasova — with the
 * 11–14 exception. Lives here because the reveal renders the same phrase on
 * the TV, the phone and in the end-of-game diploma subtitle.
 */
export function fibbageGlasLabel(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'glasova';
  const mod10 = n % 10;
  if (mod10 === 1) return 'glas';
  if (mod10 >= 2 && mod10 <= 4) return 'glasa';
  return 'glasova';
}
