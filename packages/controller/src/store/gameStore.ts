import { create } from 'zustand';
import type { GameState } from '@igra/shared';

interface ControllerGameStore {
  gameId: string | null;
  gameState: GameState | null;
  playerData: Record<string, unknown> | null;
  setGameState: (state: GameState) => void;
  setPlayerData: (data: Record<string, unknown>) => void;
  resetGame: () => void;
}

export const useGameStore = create<ControllerGameStore>((set) => ({
  gameId: null,
  gameState: null,
  playerData: null,
  setGameState: (gameState) => set({ gameState, gameId: gameState.gameId }),
  setPlayerData: (playerData) => set({ playerData }),
  resetGame: () => set({ gameId: null, gameState: null, playerData: null }),
}));
