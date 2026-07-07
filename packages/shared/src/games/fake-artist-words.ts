import type { Language } from '../i18n/types.js';

export interface FakeArtistWord {
  word: string;
  /** Public hint shown to everyone, including the fake artist. */
  category: string;
}

// Serbian (Latin) bank. Each category has ≥4 words so the fake's
// multiple-choice guess can be padded with same-category distractors.
export const FAKE_ARTIST_WORDS: FakeArtistWord[] = [
  // Životinje
  { word: 'slon', category: 'Životinje' },
  { word: 'žirafa', category: 'Životinje' },
  { word: 'pingvin', category: 'Životinje' },
  { word: 'krokodil', category: 'Životinje' },
  { word: 'jež', category: 'Životinje' },
  { word: 'kornjača', category: 'Životinje' },
  { word: 'leptir', category: 'Životinje' },
  { word: 'hobotnica', category: 'Životinje' },
  { word: 'medved', category: 'Životinje' },
  { word: 'lisica', category: 'Životinje' },

  // Hrana
  { word: 'pica', category: 'Hrana' },
  { word: 'hamburger', category: 'Hrana' },
  { word: 'sladoled', category: 'Hrana' },
  { word: 'palačinka', category: 'Hrana' },
  { word: 'lubenica', category: 'Hrana' },
  { word: 'kroasan', category: 'Hrana' },
  { word: 'ćevapi', category: 'Hrana' },
  { word: 'torta', category: 'Hrana' },
  { word: 'sendvič', category: 'Hrana' },
  { word: 'krofna', category: 'Hrana' },

  // Prevoz
  { word: 'avion', category: 'Prevoz' },
  { word: 'bicikl', category: 'Prevoz' },
  { word: 'brod', category: 'Prevoz' },
  { word: 'voz', category: 'Prevoz' },
  { word: 'helikopter', category: 'Prevoz' },
  { word: 'traktor', category: 'Prevoz' },
  { word: 'raketa', category: 'Prevoz' },
  { word: 'motor', category: 'Prevoz' },
  { word: 'autobus', category: 'Prevoz' },
  { word: 'balon', category: 'Prevoz' },

  // Priroda
  { word: 'vulkan', category: 'Priroda' },
  { word: 'vodopad', category: 'Priroda' },
  { word: 'duga', category: 'Priroda' },
  { word: 'planina', category: 'Priroda' },
  { word: 'kaktus', category: 'Priroda' },
  { word: 'ostrvo', category: 'Priroda' },
  { word: 'pećina', category: 'Priroda' },
  { word: 'reka', category: 'Priroda' },
  { word: 'šuma', category: 'Priroda' },
  { word: 'munja', category: 'Priroda' },

  // Predmeti u kući
  { word: 'lampa', category: 'Predmeti' },
  { word: 'sat', category: 'Predmeti' },
  { word: 'kišobran', category: 'Predmeti' },
  { word: 'naočare', category: 'Predmeti' },
  { word: 'ključ', category: 'Predmeti' },
  { word: 'stolica', category: 'Predmeti' },
  { word: 'sveća', category: 'Predmeti' },
  { word: 'čajnik', category: 'Predmeti' },
  { word: 'makaze', category: 'Predmeti' },
  { word: 'ogledalo', category: 'Predmeti' },

  // Sport
  { word: 'fudbal', category: 'Sport' },
  { word: 'košarka', category: 'Sport' },
  { word: 'tenis', category: 'Sport' },
  { word: 'skijanje', category: 'Sport' },
  { word: 'plivanje', category: 'Sport' },
  { word: 'boks', category: 'Sport' },
  { word: 'odbojka', category: 'Sport' },
  { word: 'surfovanje', category: 'Sport' },

  // Zgrade i mesta
  { word: 'zamak', category: 'Mesta' },
  { word: 'svetionik', category: 'Mesta' },
  { word: 'crkva', category: 'Mesta' },
  { word: 'most', category: 'Mesta' },
  { word: 'piramida', category: 'Mesta' },
  { word: 'nebodera', category: 'Mesta' },
  { word: 'vetrenjača', category: 'Mesta' },
  { word: 'šator', category: 'Mesta' },

  // Muzika
  { word: 'gitara', category: 'Muzika' },
  { word: 'klavir', category: 'Muzika' },
  { word: 'truba', category: 'Muzika' },
  { word: 'bubanj', category: 'Muzika' },
  { word: 'violina', category: 'Muzika' },
  { word: 'harmonika', category: 'Muzika' },
];

// English bank — parallel categories.
export const FAKE_ARTIST_WORDS_EN: FakeArtistWord[] = [
  // Animals
  { word: 'elephant', category: 'Animals' },
  { word: 'giraffe', category: 'Animals' },
  { word: 'penguin', category: 'Animals' },
  { word: 'crocodile', category: 'Animals' },
  { word: 'hedgehog', category: 'Animals' },
  { word: 'turtle', category: 'Animals' },
  { word: 'butterfly', category: 'Animals' },
  { word: 'octopus', category: 'Animals' },
  { word: 'bear', category: 'Animals' },
  { word: 'fox', category: 'Animals' },

  // Food
  { word: 'pizza', category: 'Food' },
  { word: 'burger', category: 'Food' },
  { word: 'ice cream', category: 'Food' },
  { word: 'pancake', category: 'Food' },
  { word: 'watermelon', category: 'Food' },
  { word: 'croissant', category: 'Food' },
  { word: 'hot dog', category: 'Food' },
  { word: 'cake', category: 'Food' },
  { word: 'sandwich', category: 'Food' },
  { word: 'donut', category: 'Food' },

  // Transport
  { word: 'airplane', category: 'Transport' },
  { word: 'bicycle', category: 'Transport' },
  { word: 'ship', category: 'Transport' },
  { word: 'train', category: 'Transport' },
  { word: 'helicopter', category: 'Transport' },
  { word: 'tractor', category: 'Transport' },
  { word: 'rocket', category: 'Transport' },
  { word: 'motorcycle', category: 'Transport' },
  { word: 'bus', category: 'Transport' },
  { word: 'hot air balloon', category: 'Transport' },

  // Nature
  { word: 'volcano', category: 'Nature' },
  { word: 'waterfall', category: 'Nature' },
  { word: 'rainbow', category: 'Nature' },
  { word: 'mountain', category: 'Nature' },
  { word: 'cactus', category: 'Nature' },
  { word: 'island', category: 'Nature' },
  { word: 'cave', category: 'Nature' },
  { word: 'river', category: 'Nature' },
  { word: 'forest', category: 'Nature' },
  { word: 'lightning', category: 'Nature' },

  // Objects
  { word: 'lamp', category: 'Objects' },
  { word: 'clock', category: 'Objects' },
  { word: 'umbrella', category: 'Objects' },
  { word: 'glasses', category: 'Objects' },
  { word: 'key', category: 'Objects' },
  { word: 'chair', category: 'Objects' },
  { word: 'candle', category: 'Objects' },
  { word: 'teapot', category: 'Objects' },
  { word: 'scissors', category: 'Objects' },
  { word: 'mirror', category: 'Objects' },

  // Sport
  { word: 'football', category: 'Sport' },
  { word: 'basketball', category: 'Sport' },
  { word: 'tennis', category: 'Sport' },
  { word: 'skiing', category: 'Sport' },
  { word: 'swimming', category: 'Sport' },
  { word: 'boxing', category: 'Sport' },
  { word: 'volleyball', category: 'Sport' },
  { word: 'surfing', category: 'Sport' },

  // Places
  { word: 'castle', category: 'Places' },
  { word: 'lighthouse', category: 'Places' },
  { word: 'church', category: 'Places' },
  { word: 'bridge', category: 'Places' },
  { word: 'pyramid', category: 'Places' },
  { word: 'skyscraper', category: 'Places' },
  { word: 'windmill', category: 'Places' },
  { word: 'tent', category: 'Places' },

  // Music
  { word: 'guitar', category: 'Music' },
  { word: 'piano', category: 'Music' },
  { word: 'trumpet', category: 'Music' },
  { word: 'drum', category: 'Music' },
  { word: 'violin', category: 'Music' },
  { word: 'accordion', category: 'Music' },
];

export function getFakeArtistWords(lang: Language): FakeArtistWord[] {
  return lang === 'en' ? FAKE_ARTIST_WORDS_EN : FAKE_ARTIST_WORDS;
}
