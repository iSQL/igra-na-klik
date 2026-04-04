import { useCallback } from 'react';
import { SoundManager } from '../audio/SoundManager';

export function useSound() {
  const play = useCallback(
    (name: Parameters<typeof SoundManager.play>[0]) => {
      SoundManager.play(name);
    },
    []
  );

  return { play };
}
