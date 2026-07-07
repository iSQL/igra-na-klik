import type { ComponentType } from 'react';

type LazyGameComponent = () => Promise<{ default: ComponentType }>;

export const CONTROLLER_GAME_COMPONENTS: Record<string, LazyGameComponent> = {
  'test-game': () => import('./test-game/TestGameController'),
  quiz: () => import('./quiz/QuizGameController'),
  'draw-guess': () => import('./draw-guess/DrawGuessController'),
  'fake-artist': () => import('./fake-artist/FakeArtistController'),
  fibbage: () => import('./fibbage/FibbageController'),
  'slepi-telefoni': () => import('./slepi-telefoni/SlepiTelefoniController'),
  'geo-pogodi': () => import('./geo-pogodi/GeoGuessController'),
  'foto-kviz': () => import('./foto-kviz/FotoKvizController'),
  'ko-sam-ja': () => import('./ko-sam-ja/KoSamJaController'),
  'spot-it': () => import('./spot-it/SpotItController'),
  'tajni-agenti': () => import('./tajni-agenti/TajniAgentiController'),
};

let prefetchStarted = false;

/**
 * Warms every lazy game chunk while the player idles in the lobby, so
 * `game:started` doesn't hit a "Loading..." spinner on a slow phone
 * connection. Chunks load one at a time with a small gap to stay out of
 * the way of anything the lobby still needs.
 */
export function prefetchGameComponents(): void {
  if (prefetchStarted) return;
  prefetchStarted = true;

  const loaders = Object.values(CONTROLLER_GAME_COMPONENTS);
  let i = 0;
  const loadNext = () => {
    if (i >= loaders.length) return;
    loaders[i++]()
      .catch(() => {})
      .finally(() => setTimeout(loadNext, 300));
  };
  // Let the lobby settle first.
  setTimeout(loadNext, 2000);
}
