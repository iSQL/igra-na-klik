import type { Stroke } from './draw-guess.js';

export type SlepiTelefoniPhase =
  | 'entering-prompts'
  | 'drawing-step'
  | 'guess-step'
  | 'reveal'
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

export interface SlepiTelefoniHostData {
  totalRounds: number;
  stepIndex: number;
  totalSteps: number;
  stepKind?: 'drawing' | 'guess';
  submittedCount: number;
  totalSubmitters: number;
  currentRevealChain?: number;
  totalChains?: number;
  chainBeingRevealed?: Chain;
}

export interface SlepiTelefoniControllerData {
  role: 'prompter' | 'drawer' | 'guesser' | 'spectator';
  promptToDraw?: string;
  drawingToGuess?: Stroke[];
  hasSubmitted: boolean;
}
