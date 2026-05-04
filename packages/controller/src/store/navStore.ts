import { create } from 'zustand';

export type ControllerScreen = 'lobby' | 'game-select';

interface NavStore {
  screen: ControllerScreen;
  setScreen: (screen: ControllerScreen) => void;
}

export const useNavStore = create<NavStore>((set) => ({
  screen: 'lobby',
  setScreen: (screen) => set({ screen }),
}));
