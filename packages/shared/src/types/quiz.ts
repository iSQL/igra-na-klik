export interface QuizOption {
  index: number;
  text: string;
  color: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  /**
   * Optional image shown above the question ("Koji pevač je na slici?").
   * A server-hosted path (`/quiz-images/...`, `/geo-images/...`), a remote
   * http(s) URL, or a small inline `data:image/...` URL. Always safe to
   * broadcast — it's part of the prompt, not the answer.
   */
  imageUrl?: string;
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
  '#C75146',
  '#6FC2BB',
  '#E3B45E',
  '#7C5FA8',
] as const;
