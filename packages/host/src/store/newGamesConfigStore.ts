import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GluvoDobaDeathReveal, TajniAgentiMode } from '@igra/shared';

// Host-side round / stroke config for the newer games (Pogodi godinu,
// Ko bi pre, Lažni umetnik). Persisted so the TV remembers the operator's
// preferred settings between sessions — same idea as slepiConfigStore.
interface NewGamesConfigStore {
  pogodiGodinuRounds: number;
  koBiPreRounds: number;
  fakeArtistRounds: number;
  fakeArtistStrokes: number;
  gluvoDobaDiscussionSeconds: number;
  gluvoDobaDeathReveal: GluvoDobaDeathReveal;
  gluvoDobaFirstNightPeace: boolean;
  gluvoDobaBajacica: boolean;
  // Selected role pack id ('' = built-in balance bands + the toggles above).
  gluvoDobaPackId: string;
  // Selected "Pogodi broj" question pack id ('' = built-in question bank).
  pogodiBrojPackId: string;
  // Tajni agenti mode: classic (2 teams), duet, or coop (see @igra/shared).
  tajniAgentiMode: TajniAgentiMode;
  // Crtaj i pogodi: per-turn drawing time in seconds (60/120/180).
  drawGuessTimeLimit: number;
  // Bolji život: tutorial mode (guided game — hints + admin-driven phases).
  boljiZivotTutorial: boolean;
  // Generic per-game round count (quiz, draw-guess, fibbage, geo-pogodi,
  // foto-kviz, ko-sam-ja, spot-it). Missing key → use GAME_ROUND_CONFIG default.
  roundCounts: Record<string, number>;
  setPogodiGodinuRounds: (n: number) => void;
  setKoBiPreRounds: (n: number) => void;
  setFakeArtistRounds: (n: number) => void;
  setFakeArtistStrokes: (n: number) => void;
  setGluvoDobaDiscussionSeconds: (n: number) => void;
  setGluvoDobaDeathReveal: (v: GluvoDobaDeathReveal) => void;
  setGluvoDobaFirstNightPeace: (v: boolean) => void;
  setGluvoDobaBajacica: (v: boolean) => void;
  setGluvoDobaPackId: (id: string) => void;
  setPogodiBrojPackId: (id: string) => void;
  setTajniAgentiMode: (m: TajniAgentiMode) => void;
  setDrawGuessTimeLimit: (n: number) => void;
  setBoljiZivotTutorial: (v: boolean) => void;
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
      gluvoDobaDeathReveal: 'team',
      gluvoDobaFirstNightPeace: true,
      gluvoDobaBajacica: false,
      gluvoDobaPackId: '',
      pogodiBrojPackId: '',
      tajniAgentiMode: 'classic',
      drawGuessTimeLimit: 60,
      boljiZivotTutorial: false,
      roundCounts: {},
      setPogodiGodinuRounds: (n) => set({ pogodiGodinuRounds: n }),
      setKoBiPreRounds: (n) => set({ koBiPreRounds: n }),
      setFakeArtistRounds: (n) => set({ fakeArtistRounds: n }),
      setFakeArtistStrokes: (n) => set({ fakeArtistStrokes: n }),
      setGluvoDobaDiscussionSeconds: (n) =>
        set({ gluvoDobaDiscussionSeconds: n }),
      setGluvoDobaDeathReveal: (v) => set({ gluvoDobaDeathReveal: v }),
      setGluvoDobaFirstNightPeace: (v) => set({ gluvoDobaFirstNightPeace: v }),
      setGluvoDobaBajacica: (v) => set({ gluvoDobaBajacica: v }),
      setGluvoDobaPackId: (id) => set({ gluvoDobaPackId: id }),
      setPogodiBrojPackId: (id) => set({ pogodiBrojPackId: id }),
      setTajniAgentiMode: (m) => set({ tajniAgentiMode: m }),
      setDrawGuessTimeLimit: (n) => set({ drawGuessTimeLimit: n }),
      setBoljiZivotTutorial: (v) => set({ boljiZivotTutorial: v }),
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
export const GLUVO_DOBA_DEATH_REVEAL_OPTIONS: GluvoDobaDeathReveal[] = [
  'role',
  'team',
  'none',
];
