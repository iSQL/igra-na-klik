import { SLOZILICA_LETTER_DEFAULT } from '@igra/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AsocijacijeMode,
  GluvoDobaDeathReveal,
  HotPotatoMode,
  TajniAgentiMode,
} from '@igra/shared';

// Host-side round / stroke config for the newer games (Ko bi pre,
// Lažni umetnik…). Persisted so the TV remembers the operator's
// preferred settings between sessions — same idea as slepiConfigStore.
interface NewGamesConfigStore {
  koBiPreRounds: number;
  fakeArtistRounds: number;
  fakeArtistStrokes: number;
  gluvoDobaDiscussionSeconds: number;
  gluvoDobaDeathReveal: GluvoDobaDeathReveal;
  gluvoDobaFirstNightPeace: boolean;
  gluvoDobaBajacica: boolean;
  // Selected role pack id ('' = built-in balance bands + the toggles above).
  gluvoDobaPackId: string;
  // Gluvo doba: tutorial mode (guided game — hints + moderator-driven phases).
  gluvoDobaTutorial: boolean;
  // Tajni agenti mode: classic (2 teams), duet, or coop (see @igra/shared).
  tajniAgentiMode: TajniAgentiMode;
  // Vruć krompir: how the bomb is passed ('sequential' | 'choose' | 'kviz').
  hotPotatoMode: HotPotatoMode;
  // Vruć krompir kviz mode: seconds to answer each question.
  hotPotatoKvizAnswerSeconds: number;
  // Crtaj i pogodi: per-turn drawing time in seconds (60/120/180).
  drawGuessTimeLimit: number;
  slozilicaLetters: number;
  // Zavet (bolji-zivot): tutorial mode (guided game — hints + admin-driven phases).
  boljiZivotTutorial: boolean;
  // Špijun: discussion length (seconds), location pack id ('' = built-in
  // bank) and tutorial mode.
  spijunDiscussionSeconds: number;
  spijunPackId: string;
  spijunTutorial: boolean;
  // Asocijacije: mode (klasik/kviz) and selected puzzle pack id
  // ('__bank__' = built-in slagalice).
  asocijacijeMode: AsocijacijeMode;
  asocijacijePackId: string;
  // Osvajanje: which drawn map to play ('' = auto-pick the first valid one).
  bitkaMapId: string;
  // Generic per-game round count (quiz, draw-guess, fibbage, ko-sam-ja,
  // spot-it). Missing key → use GAME_ROUND_CONFIG default.
  roundCounts: Record<string, number>;
  setKoBiPreRounds: (n: number) => void;
  setFakeArtistRounds: (n: number) => void;
  setFakeArtistStrokes: (n: number) => void;
  setGluvoDobaDiscussionSeconds: (n: number) => void;
  setGluvoDobaDeathReveal: (v: GluvoDobaDeathReveal) => void;
  setGluvoDobaFirstNightPeace: (v: boolean) => void;
  setGluvoDobaBajacica: (v: boolean) => void;
  setGluvoDobaPackId: (id: string) => void;
  setGluvoDobaTutorial: (v: boolean) => void;
  setTajniAgentiMode: (m: TajniAgentiMode) => void;
  setHotPotatoMode: (m: HotPotatoMode) => void;
  setHotPotatoKvizAnswerSeconds: (n: number) => void;
  setDrawGuessTimeLimit: (n: number) => void;
  setSlozilicaLetters: (n: number) => void;
  setBoljiZivotTutorial: (v: boolean) => void;
  setSpijunDiscussionSeconds: (n: number) => void;
  setSpijunPackId: (id: string) => void;
  setSpijunTutorial: (v: boolean) => void;
  setAsocijacijeMode: (m: AsocijacijeMode) => void;
  setAsocijacijePackId: (id: string) => void;
  setBitkaMapId: (id: string) => void;
  setRoundCount: (gameId: string, n: number) => void;
}

export const useNewGamesConfigStore = create<NewGamesConfigStore>()(
  persist(
    (set) => ({
      koBiPreRounds: 8,
      fakeArtistRounds: 3,
      fakeArtistStrokes: 2,
      gluvoDobaDiscussionSeconds: 180,
      gluvoDobaDeathReveal: 'team',
      gluvoDobaFirstNightPeace: true,
      gluvoDobaBajacica: false,
      gluvoDobaPackId: '',
      gluvoDobaTutorial: false,
      tajniAgentiMode: 'classic',
      hotPotatoMode: 'sequential',
      hotPotatoKvizAnswerSeconds: 5,
      drawGuessTimeLimit: 60,
      slozilicaLetters: SLOZILICA_LETTER_DEFAULT,
      boljiZivotTutorial: false,
      spijunDiscussionSeconds: 420,
      spijunPackId: '',
      spijunTutorial: false,
      asocijacijeMode: 'klasik',
      // '' = auto-pick the first pack valid for the current mode.
      asocijacijePackId: '',
      // '' = auto-pick the first map that passes the strict check.
      bitkaMapId: '',
      roundCounts: {},
      setKoBiPreRounds: (n) => set({ koBiPreRounds: n }),
      setFakeArtistRounds: (n) => set({ fakeArtistRounds: n }),
      setFakeArtistStrokes: (n) => set({ fakeArtistStrokes: n }),
      setGluvoDobaDiscussionSeconds: (n) =>
        set({ gluvoDobaDiscussionSeconds: n }),
      setGluvoDobaDeathReveal: (v) => set({ gluvoDobaDeathReveal: v }),
      setGluvoDobaFirstNightPeace: (v) => set({ gluvoDobaFirstNightPeace: v }),
      setGluvoDobaBajacica: (v) => set({ gluvoDobaBajacica: v }),
      setGluvoDobaPackId: (id) => set({ gluvoDobaPackId: id }),
      setGluvoDobaTutorial: (v) => set({ gluvoDobaTutorial: v }),
      setTajniAgentiMode: (m) => set({ tajniAgentiMode: m }),
      setHotPotatoMode: (m) => set({ hotPotatoMode: m }),
      setHotPotatoKvizAnswerSeconds: (n) =>
        set({ hotPotatoKvizAnswerSeconds: n }),
      setDrawGuessTimeLimit: (n) => set({ drawGuessTimeLimit: n }),
      setSlozilicaLetters: (n) => set({ slozilicaLetters: n }),
      setBoljiZivotTutorial: (v) => set({ boljiZivotTutorial: v }),
      setSpijunDiscussionSeconds: (n) => set({ spijunDiscussionSeconds: n }),
      setSpijunPackId: (id) => set({ spijunPackId: id }),
      setSpijunTutorial: (v) => set({ spijunTutorial: v }),
      setAsocijacijeMode: (m) => set({ asocijacijeMode: m }),
      setAsocijacijePackId: (id) => set({ asocijacijePackId: id }),
      setBitkaMapId: (id) => set({ bitkaMapId: id }),
      setRoundCount: (gameId, n) =>
        set((s) => ({ roundCounts: { ...s.roundCounts, [gameId]: n } })),
    }),
    { name: 'new-games-config' }
  )
);

export const KO_BI_PRE_ROUND_OPTIONS = [5, 8, 10, 12];
export const FAKE_ARTIST_ROUND_OPTIONS = [1, 2, 3, 4, 5];
export const FAKE_ARTIST_STROKE_OPTIONS = [1, 2, 3];
export const GLUVO_DOBA_DISCUSSION_OPTIONS = [120, 180, 240];
export const HOT_POTATO_KVIZ_ANSWER_OPTIONS = [5, 8, 10, 15, 20];
export const SPIJUN_DISCUSSION_OPTIONS = [300, 420, 480, 600];
export const GLUVO_DOBA_DEATH_REVEAL_OPTIONS: GluvoDobaDeathReveal[] = [
  'role',
  'team',
  'none',
];
