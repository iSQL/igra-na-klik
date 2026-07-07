export interface QuizOption {
  index: number;
  text: string;
  color: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
  timeLimit: number;
}

/** Full question with answer — only used server-side and in results */
export interface QuizQuestionFull extends QuizQuestion {
  correctIndex: number;
}

export interface QuizResultAnswer {
  playerId: string;
  optionIndex: number;
  timeMs: number;
  correct: boolean;
}

export interface QuizResultData {
  question: QuizQuestion & { correctIndex: number };
  answers: QuizResultAnswer[];
  scores: { playerId: string; roundScore: number; totalScore: number }[];
}

export interface QuizLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export const QUIZ_OPTION_COLORS = [
  '#FF2E88',
  '#22DEE6',
  '#FFB627',
  '#8B41F2',
] as const;
