import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Host-side round / stroke config for the newer games (Pogodi godinu,
// Ko bi pre, Lažni umetnik). Persisted so the TV remembers the operator's
// preferred settings between sessions — same idea as slepiConfigStore.
interface NewGamesConfigStore {
  pogodiGodinuRounds: number;
  koBiPreRounds: number;
  fakeArtistRounds: number;
  fakeArtistStrokes: number;
  gluvoDobaDiscussionSeconds: number;
  // Generic per-game round count (quiz, draw-guess, fibbage, geo-pogodi,
  // foto-kviz, ko-sam-ja, spot-it). Missing key → use GAME_ROUND_CONFIG default.
  roundCounts: Record<string, number>;
  setPogodiGodinuRounds: (n: number) => void;
  setKoBiPreRounds: (n: number) => void;
  setFakeArtistRounds: (n: number) => void;
  setFakeArtistStrokes: (n: number) => void;
  setGluvoDobaDiscussionSeconds: (n: number) => void;
  setRoundCount: (gameId: string, n: number) => void;
}

export const useNewGamesConfigStore = create<NewGamesConfigStore>()(
  persist(
    (set) => ({
      pogodiGodinuRounds: 10,
      koBiPreRounds: 8,
      fakeArtistRounds: 3,
      fakeArtistStrokes: 2,
      gluvoDobaDiscussionSeconds: 180,
      roundCounts: {},
      setPogodiGodinuRounds: (n) => set({ pogodiGodinuRounds: n }),
      setKoBiPreRounds: (n) => set({ koBiPreRounds: n }),
      setFakeArtistRounds: (n) => set({ fakeArtistRounds: n }),
      setFakeArtistStrokes: (n) => set({ fakeArtistStrokes: n }),
      setGluvoDobaDiscussionSeconds: (n) =>
        set({ gluvoDobaDiscussionSeconds: n }),
      setRoundCount: (gameId, n) =>
        set((s) => ({ roundCounts: { ...s.roundCounts, [gameId]: n } })),
    }),
    { name: 'new-games-config' }
  )
);

export const POGODI_GODINU_ROUND_OPTIONS = [5, 8, 10, 15];
export const KO_BI_PRE_ROUND_OPTIONS = [5, 8, 10, 12];
export const FAKE_ARTIST_ROUND_OPTIONS = [1, 2, 3, 4, 5];
export const FAKE_ARTIST_STROKE_OPTIONS = [1, 2, 3];
export const GLUVO_DOBA_DISCUSSION_OPTIONS = [120, 180, 240];
