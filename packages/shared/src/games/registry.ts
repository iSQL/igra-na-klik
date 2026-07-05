import type { GameDefinition } from '../types/game.js';

export const GAME_DEFINITIONS: Record<string, GameDefinition> = {
  quiz: {
    id: 'quiz',
    name: 'Kviz',
    minPlayers: 2,
    maxPlayers: 8,
    description: 'Pitanja na vreme — najbrži tačan odgovor nosi najviše poena!',
    supportsHostless: true,
  },
  'draw-guess': {
    id: 'draw-guess',
    name: 'Crtaj i pogodi',
    minPlayers: 3,
    maxPlayers: 8,
    description: 'Crtajte redom — ostali pogađaju reč!',
    supportsHostless: true,
  },
  fibbage: {
    id: 'fibbage',
    name: 'Lažov',
    minPlayers: 3,
    maxPlayers: 8,
    description: 'Napiši lažan odgovor, pronađi pravi, prevari ostale!',
  },
  'slepi-telefoni': {
    id: 'slepi-telefoni',
    name: 'Slepi telefoni',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Napiši frazu, sledeći je crta, zatim sledeći pogađa — pogledajte kako se rečenica izvitoperi!',
  },
  'geo-pogodi': {
    id: 'geo-pogodi',
    name: 'Pogodi gde je',
    minPlayers: 1,
    maxPlayers: 8,
    description:
      'Pogodi gde je u Srbiji slikana fotografija — bliža igla, više poena!',
  },
  'foto-kviz': {
    id: 'foto-kviz',
    name: 'Foto kviz',
    minPlayers: 1,
    maxPlayers: 8,
    description:
      'Pogledaj fotografiju i izaberi pravu lokaciju od 4 ponuđena odgovora!',
  },
  'ko-sam-ja': {
    id: 'ko-sam-ja',
    name: 'Ko sam ja?',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Lična pitanja o igračima — koliko dobro poznajete jedni druge?',
  },
  'spot-it': {
    id: 'spot-it',
    name: 'Pronađi par',
    minPlayers: 2,
    maxPlayers: 12,
    description:
      'Tvoja karta i centralna karta dele tačno jedan simbol — pronađi ga prvi!',
  },
  'tajni-agenti': {
    id: 'tajni-agenti',
    name: 'Tajni agenti',
    // Floor is 2 (only allowed with a scenario loaded — see
    // TajniAgentiModule.validateStart). Without a scenario the module
    // still rejects under 4 players because the spymaster + guesser
    // role split doesn't work below that.
    minPlayers: 2,
    maxPlayers: 8,
    description:
      'Špijun daje šifru tima — saigrači pogađaju reči, ali pazi na ubicu!',
  },
};
