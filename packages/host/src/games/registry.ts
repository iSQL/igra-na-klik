import type { ComponentType } from 'react';

type LazyGameComponent = () => Promise<{ default: ComponentType }>;

export const HOST_GAME_COMPONENTS: Record<string, LazyGameComponent> = {
  'test-game': () => import('./test-game/TestGameHost'),
  quiz: () => import('./quiz/QuizGameHost'),
  'draw-guess': () => import('./draw-guess/DrawGuessHost'),
  fibbage: () => import('./fibbage/FibbageHost'),
  'slepi-telefoni': () => import('./slepi-telefoni/SlepiTelefoniHost'),
  'geo-pogodi': () => import('./geo-pogodi/GeoGuessHost'),
  'foto-kviz': () => import('./foto-kviz/FotoKvizHost'),
};
