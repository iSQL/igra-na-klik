import type { GameDefinition } from '../types/game.js';

export const GAME_DEFINITIONS: Record<string, GameDefinition> = {
  'test-game': {
    id: 'test-game',
    name: 'Test Game',
    minPlayers: 1,
    maxPlayers: 8,
    description: 'First player to press the button wins!',
  },
  quiz: {
    id: 'quiz',
    name: 'Quiz',
    minPlayers: 2,
    maxPlayers: 8,
    description: 'Timed multiple choice — fastest correct answer scores the most!',
  },
};
