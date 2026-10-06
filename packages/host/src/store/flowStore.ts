import { create } from 'zustand';
import type { GameFlowState } from '@igra/shared';

/** Platform flow of the running game (pause, 3-2-1) — set from App. */
export const useFlowStore = create<{ flow: GameFlowState | null }>(() => ({
  flow: null,
}));

/** True while the game is paused (including the resume countdown). */
export function usePaused(): boolean {
  return useFlowStore((s) => !!s.flow?.paused);
}
