import { create } from 'zustand';
import type { GameState, HostStartGamePayload } from '@igra/shared';

interface GameStore {
  gameId: string | null;
  gameState: GameState | null;
  // Exact payload of the last host:start-game — powers the one-click
  // "Igraj ponovo" rematch with identical settings. Survives resetGame
  // on purpose (that's when a rematch is offered).
  lastStartPayload: HostStartGamePayload | null;
  setGameState: (state: GameState) => void;
  setGameId: (id: string | null) => void;
  setLastStartPayload: (payload: HostStartGamePayload) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameId: null,
  gameState: null,
  lastStartPayload: null,
  setGameState: (gameState) => set({ gameState, gameId: gameState.gameId }),
  setGameId: (gameId) => set({ gameId }),
  setLastStartPayload: (lastStartPayload) => set({ lastStartPayload }),
  resetGame: () => set({ gameId: null, gameState: null }),
}));
