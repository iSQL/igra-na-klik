import { Suspense, lazy, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { CONTROLLER_GAME_COMPONENTS } from '../games/registry';

export function GameRouter() {
  const gameId = useGameStore((s) => s.gameId);

  const GameComponent = useMemo(() => {
    if (!gameId) return null;
    const loader = CONTROLLER_GAME_COMPONENTS[gameId];
    if (!loader) return null;
    return lazy(loader);
  }, [gameId]);

  if (!GameComponent) {
    return <p style={{ fontSize: '1.2rem' }}>Unknown game</p>;
  }

  return (
    <Suspense fallback={<p style={{ fontSize: '1.2rem' }}>Loading...</p>}>
      <GameComponent />
    </Suspense>
  );
}
