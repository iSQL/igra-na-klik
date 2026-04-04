import { Suspense, lazy, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { HOST_GAME_COMPONENTS } from '../games/registry';

export function GameRouter() {
  const gameId = useGameStore((s) => s.gameId);

  const GameComponent = useMemo(() => {
    if (!gameId) return null;
    const loader = HOST_GAME_COMPONENTS[gameId];
    if (!loader) return null;
    return lazy(loader);
  }, [gameId]);

  if (!GameComponent) {
    return <p style={{ fontSize: '1.5rem' }}>Unknown game</p>;
  }

  return (
    <Suspense fallback={<p style={{ fontSize: '1.5rem' }}>Loading game...</p>}>
      <GameComponent />
    </Suspense>
  );
}
