import type { ComponentType } from 'react';

type LazyGameComponent = () => Promise<{ default: ComponentType }>;

export const CONTROLLER_GAME_COMPONENTS: Record<string, LazyGameComponent> = {
  'test-game': () => import('./test-game/TestGameController'),
  quiz: () => import('./quiz/QuizGameController'),
  'draw-guess': () => import('./draw-guess/DrawGuessController'),
  fibbage: () => import('./fibbage/FibbageController'),
  'slepi-telefoni': () => import('./slepi-telefoni/SlepiTelefoniController'),
  'geo-pogodi': () => import('./geo-pogodi/GeoGuessController'),
  'foto-kviz': () => import('./foto-kviz/FotoKvizController'),
};
