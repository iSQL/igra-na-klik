import { create } from 'zustand';
import type { GameState, HostStartGamePayload } from '@igra/shared';

interface ControllerGameStore {
  gameId: string | null;
  gameState: GameState | null;
  playerData: Record<string, unknown> | null;
  // Exact payload of the last host:start-game this controller sent —
  // powers the one-tap "Igraj ponovo" rematch with identical settings.
  // Survives resetGame on purpose (that's when a rematch is offered).
  lastStartPayload: HostStartGamePayload | null;
  setGameState: (state: GameState) => void;
  setPlayerData: (data: Record<string, unknown>) => void;
  setLastStartPayload: (payload: HostStartGamePayload) => void;
  resetGame: () => void;
}

export const useGameStore = create<ControllerGameStore>((set) => ({
  gameId: null,
  gameState: null,
  playerData: null,
  lastStartPayload: null,
  setGameState: (gameState) => set({ gameState, gameId: gameState.gameId }),
  setPlayerData: (playerData) => set({ playerData }),
  setLastStartPayload: (lastStartPayload) => set({ lastStartPayload }),
  resetGame: () => set({ gameId: null, gameState: null, playerData: null }),
}));
