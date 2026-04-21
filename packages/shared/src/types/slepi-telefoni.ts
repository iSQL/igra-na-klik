import type { Stroke } from './draw-guess.js';

export type SlepiTelefoniPhase =
  | 'entering-prompts'
  | 'drawing-step'
  | 'guess-step'
  | 'reveal'
  | 'voting'
  | 'winner'
  | 'final-leaderboard'
  | 'ended';

export type ChainItemKind = 'prompt' | 'drawing' | 'guess';

export interface ChainItem {
  kind: ChainItemKind;
  authorId: string;
  authorName: string;
  authorColor: string;
  text?: string;
  strokes?: Stroke[];
}

export interface Chain {
  chainIndex: number;
  originId: string;
  originName: string;
  originColor: string;
  items: ChainItem[];
}

export interface SlepiTelefoniChainSummary {
  chainIndex: number;
  originName: string;
  originColor: string;
  lastItem: ChainItem;
}

export interface SlepiTelefoniLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export interface SlepiTelefoniHostData {
  totalRounds: number;
  stepIndex: number;
  totalSteps: number;
  stepKind?: 'drawing' | 'guess';
  submittedCount: number;
  totalSubmitters: number;
  currentRevealChain?: number;
  chainBeingRevealed?: Chain;
  chainsForVoting?: Chain[];
  voteCounts?: Record<number, number>;
  votedCount?: number;
  totalVoters?: number;
  winnerChain?: Chain;
  winnerVotes?: number;
  finalLeaderboard?: SlepiTelefoniLeaderboardEntry[];
}

export interface SlepiTelefoniControllerData {
  role: 'prompter' | 'drawer' | 'guesser' | 'voter' | 'spectator';
  promptToDraw?: string;
  drawingToGuess?: Stroke[];
  hasSubmitted: boolean;
  ownChainIndex?: number;
  hasVoted: boolean;
  votedChainIndex?: number;
  chainsForVoting?: SlepiTelefoniChainSummary[];
}
