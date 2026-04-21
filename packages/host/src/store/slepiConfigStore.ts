import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SlepiConfigStore {
  selectedRounds: number;
  setSelectedRounds: (rounds: number) => void;
}

export const useSlepiConfigStore = create<SlepiConfigStore>()(
  persist(
    (set) => ({
      selectedRounds: 2,
      setSelectedRounds: (rounds) => set({ selectedRounds: rounds }),
    }),
    { name: 'slepi-config' }
  )
);
