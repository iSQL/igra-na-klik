import { create } from 'zustand';
import type { GameState } from '@igra/shared';
import { useGameStore } from './gameStore';

/**
 * Pamćenje pitanja koja su prošla kroz ekran, da bi igrač mogao da prijavi i
 * ono **prethodno**, a ne samo tekuće.
 *
 * Postoji zato što se prijava skoro uvek seti prekasno: pitanje deluje sporno
 * tek kad se vidi tačan odgovor, a dotle ekran ode dalje — pa su najgora
 * pitanja bila i najređe prijavljena. Server ionako prima prijavu za bilo koje
 * pitanje iz tekuće partije (vidi `QuizFeedbackTracker`), pa je jedino što je
 * falilo bilo da telefon zna šta je bilo pre.
 *
 * Popup se otvara i zatvara, pa istorija NE sme da živi u komponenti — ovde je
 * i puni je pretplata na `useGameStore` koja radi od učitavanja modula, bez
 * obzira na to šta je trenutno na ekranu.
 */

export interface SeenQuestion {
  id: string;
  /** Tekst pitanja — bez njega igrač ne zna šta prijavljuje. */
  label: string;
}

/** Koliko pitanja unazad se pamti. Dublje od toga niko se i ne seća. */
const HISTORY_LIMIT = 10;

interface QuizFeedbackStore {
  /** Najstarije prvo; poslednje je tekuće pitanje. */
  seen: SeenQuestion[];
  /** Šta je ovaj igrač već prijavio/ocenio — server i sam dedupuje, ovo je UI. */
  reported: string[];
  rated: Record<string, number>;
  push: (q: SeenQuestion) => void;
  markReported: (id: string) => void;
  markRated: (id: string, value: number) => void;
  reset: () => void;
}

export const useQuizFeedbackStore = create<QuizFeedbackStore>((set) => ({
  seen: [],
  reported: [],
  rated: {},
  push: (q) =>
    set((s) => {
      if (s.seen.length > 0 && s.seen[s.seen.length - 1].id === q.id) return s;
      // Isto pitanje ume da se ponovi (paket se premeša u krug) — tada se
      // premešta na kraj umesto da stoji dvaput.
      const without = s.seen.filter((x) => x.id !== q.id);
      return { seen: [...without, q].slice(-HISTORY_LIMIT) };
    }),
  markReported: (id) =>
    set((s) => (s.reported.includes(id) ? s : { reported: [...s.reported, id] })),
  markRated: (id, value) => set((s) => ({ rated: { ...s.rated, [id]: value } })),
  reset: () => set({ seen: [], reported: [], rated: {} }),
}));

/**
 * Tekuće pitanje igre, ako je uopšte kviz-pitanje iz paketa.
 *
 * Svaka igra ga drži na svom mestu, pa je ovo jedino mesto koje to zna —
 * i menija i pretplata ispod čitaju odavde.
 */
export function currentQuizQuestion(state: GameState | null): SeenQuestion | null {
  if (!state) return null;
  const data = state.data as Record<string, unknown> | undefined;
  if (!data) return null;

  if (state.gameId === 'quiz') {
    const id = data.questionId;
    const label = data.questionText;
    if (typeof id !== 'string' || !id) return null;
    return { id, label: typeof label === 'string' ? label : '' };
  }

  // KvizAtar i Vrući krompir oba drže pitanje u broadcast polovini.
  if (state.gameId === 'osvajanje' || state.gameId === 'hot-potato') {
    const host = data.host as { question?: { id?: string; text?: string } } | undefined;
    const q = host?.question;
    if (!q || typeof q.id !== 'string' || !q.id) return null;
    return { id: q.id, label: typeof q.text === 'string' ? q.text : '' };
  }

  return null;
}

/**
 * Puni istoriju dok se igra i briše je na promeni igre.
 *
 * Pretplata na nivou modula, a ne hook u komponenti: meni sa prijavom postoji
 * samo dok je popup otvoren, pa bi hook propustio sva pitanja odigrana dok je
 * bio zatvoren — što je upravo slučaj koji ovo treba da pokrije.
 */
let lastGameKey: string | null = null;

useGameStore.subscribe((s) => {
  const state = s.gameState;
  const key = state ? `${state.gameId}` : null;
  if (key !== lastGameKey) {
    lastGameKey = key;
    useQuizFeedbackStore.getState().reset();
  }
  const q = currentQuizQuestion(state);
  if (q) useQuizFeedbackStore.getState().push(q);
});
