import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '@igra/shared';

interface LanguageStore {
  language: Language;
  setLanguage: (language: Language) => void;
}

// Per-device language preference (persisted to localStorage). Each phone
// keeps its own choice, independent of the host TV.
export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: 'sr',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'igra-language' }
  )
);
