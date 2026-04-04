import { create } from 'zustand';
import type { GameState } from '@igra/shared';

interface GameStore {
  gameId: string | null;
  gameState: GameState | null;
  setGameState: (state: GameState) => void;
  setGameId: (id: string | null) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameId: null,
  gameState: null,
  setGameState: (gameState) => set({ gameState, gameId: gameState.gameId }),
  setGameId: (gameId) => set({ gameId }),
  resetGame: () => set({ gameId: null, gameState: null }),
}));
