import { create } from 'zustand';
import type { GameState, HostStartGamePayload, PlayerAward } from '@igra/shared';

/** The Puzla picture uploaded for one room — invalid in any other room. */
export interface PuzlaUploadedImage {
  roomCode: string;
  imageId: string;
  url: string;
  width: number;
  height: number;
}

interface GameStore {
  gameId: string | null;
  gameState: GameState | null;
  // Exact payload of the last host:start-game — powers the one-click
  // "Igraj ponovo" rematch with identical settings. Survives resetGame
  // on purpose (that's when a rematch is offered).
  lastStartPayload: HostStartGamePayload | null;
  // End-of-game "utešne diplome" from game:ended — drives the TV overlay.
  awards: PlayerAward[] | null;
  // Not persisted and survives resetGame (the rematch reuses it); readers
  // must check `roomCode` against the current room.
  puzlaImage: PuzlaUploadedImage | null;
  setPuzlaImage: (image: PuzlaUploadedImage | null) => void;
  setGameState: (state: GameState) => void;
  setGameId: (id: string | null) => void;
  setLastStartPayload: (payload: HostStartGamePayload) => void;
  setAwards: (awards: PlayerAward[] | null) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameId: null,
  gameState: null,
  lastStartPayload: null,
  awards: null,
  puzlaImage: null,
  setPuzlaImage: (puzlaImage) => set({ puzlaImage }),
  setGameState: (gameState) => set({ gameState, gameId: gameState.gameId }),
  setGameId: (gameId) => set({ gameId }),
  setLastStartPayload: (lastStartPayload) => set({ lastStartPayload }),
  setAwards: (awards) => set({ awards }),
  resetGame: () => set({ gameId: null, gameState: null, awards: null }),
}));
