import type { ComponentType } from 'react';

type LazyGameComponent = () => Promise<{ default: ComponentType }>;

export const HOST_GAME_COMPONENTS: Record<string, LazyGameComponent> = {
  'test-game': () => import('./test-game/TestGameHost'),
  quiz: () => import('./quiz/QuizGameHost'),
  'draw-guess': () => import('./draw-guess/DrawGuessHost'),
  'fake-artist': () => import('./fake-artist/FakeArtistHost'),
  'ko-bi-pre': () => import('./ko-bi-pre/KoBiPreHost'),
  'dve-istine-i-laz': () => import('./dve-istine-i-laz/DveIstineHost'),
  'pogodi-godinu': () => import('./pogodi-godinu/PogodiGodinuHost'),
  fibbage: () => import('./fibbage/FibbageHost'),
  'slepi-telefoni': () => import('./slepi-telefoni/SlepiTelefoniHost'),
  'geo-pogodi': () => import('./geo-pogodi/GeoGuessHost'),
  'foto-kviz': () => import('./foto-kviz/FotoKvizHost'),
  'ko-sam-ja': () => import('./ko-sam-ja/KoSamJaHost'),
  'spot-it': () => import('./spot-it/SpotItHost'),
  'tajni-agenti': () => import('./tajni-agenti/TajniAgentiHost'),
  'gluvo-doba': () => import('./gluvo-doba/GluvoDobaHost'),
  'bolji-zivot': () => import('./bolji-zivot/BoljiZivotHost'),
  'hot-potato': () => import('./hot-potato/HotPotatoHost'),
  'emoji-zagonetke': () => import('./emoji-zagonetke/EmojiZagonetkeHost'),
};

let prefetchStarted = false;

/**
 * Warms every lazy game chunk while the room idles in the lobby, so
 * starting a game doesn't hit the "Loading game..." spinner. Chunks load
 * one at a time with a small gap so the lobby isn't starved.
 */
export function prefetchGameComponents(): void {
  if (prefetchStarted) return;
  prefetchStarted = true;

  const loaders = Object.values(HOST_GAME_COMPONENTS);
  let i = 0;
  const loadNext = () => {
    if (i >= loaders.length) return;
    loaders[i++]()
      .catch(() => {})
      .finally(() => setTimeout(loadNext, 300));
  };
  setTimeout(loadNext, 2000);
}
