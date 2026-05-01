import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GeoConfigStore {
  mode: 'predefined' | 'custom';
  selectedPackId: string | null;
  customPhotosPerPlayer: number;
  setMode: (mode: 'predefined' | 'custom') => void;
  setSelectedPackId: (id: string | null) => void;
  setCustomPhotosPerPlayer: (n: number) => void;
}

export const useGeoConfigStore = create<GeoConfigStore>()(
  persist(
    (set) => ({
      mode: 'predefined',
      selectedPackId: null,
      customPhotosPerPlayer: 2,
      setMode: (mode) => set({ mode }),
      setSelectedPackId: (selectedPackId) => set({ selectedPackId }),
      setCustomPhotosPerPlayer: (customPhotosPerPlayer) =>
        set({ customPhotosPerPlayer }),
    }),
    { name: 'igra-geo-config' }
  )
);
