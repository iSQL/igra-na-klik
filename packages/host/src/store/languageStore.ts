import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '@igra/shared';

interface LanguageStore {
  language: Language;
  setLanguage: (language: Language) => void;
}

// Per-device language preference (persisted to localStorage). The host TV
// and each controller keep their own choice — see CLAUDE.md i18n notes.
export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: 'sr',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'igra-language' }
  )
);
