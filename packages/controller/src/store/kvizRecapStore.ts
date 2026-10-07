import { create } from 'zustand';
import type { KvizLinkRecap } from '@igra/shared';
import { useGameStore } from './gameStore';
import { usePlayerStore } from './playerStore';

/**
 * "Tvoji odgovori" posle partije kviz linka.
 *
 * Server šalje rekapitulaciju samo u privatnoj polovini (`linkRecap` u
 * playerData) od prvih rezultata pa nadalje. Igra se posle `game:ended`
 * briše iz `useGameStore`, a ekran treba da ostane u lobiju dok igrač ne
 * krene dalje — zato je ovde, a puni je pretplata na nivou modula.
 */
interface KvizRecapStore {
  recap: KvizLinkRecap | null;
  clear: () => void;
}

export const useKvizRecapStore = create<KvizRecapStore>((set) => ({
  recap: null,
  clear: () => set({ recap: null }),
}));

let lastGameId: string | null = null;

useGameStore.subscribe((s) => {
  const state = s.gameState;
  const gameId = state?.gameId ?? null;
  // A new game wipes the old recap; the end of one (state → null) keeps it.
  if (gameId && gameId !== lastGameId) useKvizRecapStore.getState().clear();
  lastGameId = gameId;
  if (!state || state.gameId !== 'quiz') return;
  const me = usePlayerStore.getState().player?.id;
  const recap = me
    ? ((state.playerData?.[me] as { linkRecap?: KvizLinkRecap } | undefined)?.linkRecap ?? null)
    : null;
  if (recap && recap !== useKvizRecapStore.getState().recap) {
    useKvizRecapStore.setState({ recap });
  }
});
