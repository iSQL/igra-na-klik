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
    minPlayers: 2,
    maxPlayers: 8,
    description: 'Crtajte redom — ostali pogađaju reč!',
    supportsHostless: true,
  },
  'fake-artist': {
    id: 'fake-artist',
    name: 'Lažni umetnik',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Svi crtaju istu reč po jedan potez — osim uljeza koji je ne zna. Pronađite lažnjaka!',
    supportsHostless: true,
  },
  fibbage: {
    id: 'fibbage',
    name: 'Lažov',
    minPlayers: 2,
    maxPlayers: 8,
    description: 'Napiši lažan odgovor, pronađi pravi, prevari ostale!',
    supportsHostless: true,
  },
  'ko-bi-pre': {
    id: 'ko-bi-pre',
    name: 'Ko bi pre?',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Glasajte ko bi pre uradio nešto — poeni onima koji pogode većinu!',
    supportsHostless: true,
  },
  'dve-istine-i-laz': {
    id: 'dve-istine-i-laz',
    name: 'Dve istine i laž',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Svako napiše dve istine i jednu laž o sebi — ostali pogađaju šta je laž!',
    supportsHostless: true,
  },
  'pogodi-godinu': {
    id: 'pogodi-godinu',
    name: 'Pogodi broj',
    minPlayers: 1,
    maxPlayers: 8,
    description:
      'Pogodi vrednost — cenu, godinu, težinu, dužinu… bliži pogodak, više poena!',
    supportsHostless: true,
  },
  'slepi-telefoni': {
    id: 'slepi-telefoni',
    name: 'Slepi telefoni',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Napiši frazu, sledeći je crta, zatim sledeći pogađa — pogledajte kako se rečenica izvitoperi!',
    supportsHostless: true,
  },
  'geo-pogodi': {
    id: 'geo-pogodi',
    name: 'Pogodi gde je',
    minPlayers: 1,
    maxPlayers: 8,
    description:
      'Pogodi gde je u Srbiji slikana fotografija — bliža igla, više poena!',
    supportsHostless: true,
  },
  'foto-kviz': {
    id: 'foto-kviz',
    name: 'Foto kviz',
    minPlayers: 1,
    maxPlayers: 8,
    description:
      'Pogledaj fotografiju i izaberi pravu lokaciju od 4 ponuđena odgovora!',
    supportsHostless: true,
  },
  'ko-sam-ja': {
    id: 'ko-sam-ja',
    name: 'Ko sam ja?',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Lična pitanja o igračima — koliko dobro poznajete jedni druge?',
    supportsHostless: true,
  },
  'spot-it': {
    id: 'spot-it',
    name: 'Pronađi par',
    minPlayers: 2,
    maxPlayers: 12,
    description:
      'Tvoja karta i centralna karta dele tačno jedan simbol — pronađi ga prvi!',
    // Hostless-capable: in a hostless room the phone stacks the center card
    // above the player's own card (see SpotItController), so no TV is needed.
    supportsHostless: true,
  },
  'gluvo-doba': {
    id: 'gluvo-doba',
    name: 'Gluvo doba',
    minPlayers: 6,
    maxPlayers: 15,
    description:
      'Vukodlaci noću haraju selom — otkrijte ih pre nego što vas nestane!',
    supportsHostless: true,
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
    // Hostless-capable: the controller renders the full board (interactive for
    // the active guesser, secret key for spymasters) and, in hostless rooms,
    // a read-only board for waiting players — everything the TV would show.
    supportsHostless: true,
  },
};
