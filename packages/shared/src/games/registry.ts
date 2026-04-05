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
    name: 'Kviz',
    minPlayers: 2,
    maxPlayers: 8,
    description: 'Pitanja na vreme — najbrži tačan odgovor nosi najviše poena!',
  },
  'draw-guess': {
    id: 'draw-guess',
    name: 'Crtaj i pogodi',
    minPlayers: 3,
    maxPlayers: 8,
    description: 'Crtajte redom — ostali pogađaju reč!',
  },
  fibbage: {
    id: 'fibbage',
    name: 'Lažov',
    minPlayers: 3,
    maxPlayers: 8,
    description: 'Napiši lažan odgovor, pronađi pravi, prevari ostale!',
  },
};
