import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KoSamJaCategory } from '@igra/shared';

interface KoSamJaConfigStore {
  selectedCategory: KoSamJaCategory;
  setSelectedCategory: (category: KoSamJaCategory) => void;
}

export const useKoSamJaConfigStore = create<KoSamJaConfigStore>()(
  persist(
    (set) => ({
      selectedCategory: 'family',
      setSelectedCategory: (category) => set({ selectedCategory: category }),
    }),
    { name: 'ko-sam-ja-config' }
  )
);
