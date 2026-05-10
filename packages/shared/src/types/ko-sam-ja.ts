export type KoSamJaCategory = 'family' | 'nsfw';
export type KoSamJaShape = 'fixed' | 'peer' | 'free';

export interface KoSamJaUpfrontFixedQuestion {
  id: string;
  shape: 'fixed';
  text: string;
  options: string[];
}

export interface KoSamJaUpfrontFreeQuestion {
  id: string;
  shape: 'free';
  text: string;
  maxLength: number;
}

export type KoSamJaUpfrontQuestion =
  | KoSamJaUpfrontFixedQuestion
  | KoSamJaUpfrontFreeQuestion;

export interface KoSamJaPublicOption {
  id: string;
  text: string;
}

export interface KoSamJaResultGuess {
  playerId: string;
  playerName: string;
  optionId: string | null;
  correct: boolean;
  roundScore: number;
}

export interface KoSamJaResultData {
  questionText: string;
  questionShape: KoSamJaShape;
  subjectPlayerId: string;
  subjectName: string;
  options: KoSamJaPublicOption[];
  correctOptionId: string;
  guesses: KoSamJaResultGuess[];
  subjectBonus: number;
  wrongGuessCount: number;
  skipped?: boolean;
}

export interface KoSamJaLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export const KO_SAM_JA_FIXED_OPTION_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
] as const;
