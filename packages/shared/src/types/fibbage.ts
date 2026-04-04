export interface FibbageQuestion {
  id: string;
  text: string;
  answer: string;
  category?: string;
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
}

export interface FibbageResultData {
  question: FibbageQuestionPublic;
  realAnswer: string;
  realOptionId: string;
  options: FibbageAnswerOptionPublic[];
  votes: FibbageVoteTally[];
  fools: FibbageFoolEntry[];
  results: FibbageResultEntry[];
}

export interface FibbageLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export const FIBBAGE_MAX_ANSWER_LENGTH = 80;
