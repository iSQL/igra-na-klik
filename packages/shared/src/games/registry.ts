import type { GameDefinition } from '../types/game.js';

export const GAME_DEFINITIONS: Record<string, GameDefinition> = {
  quiz: {
    id: 'quiz',
    name: 'Kviz',
    minPlayers: 2,
    maxPlayers: 8,
    description:
      'Pitanja na vreme — obična, sa slikom, mapom, brojevima, pesmom, snimkom ili emoji zagonetkom. Najbliži i najbrži nosi poene!',
    icon: '🧠',
    accent: 'violet',
    category: 'quiz',
    estimatedMinutes: 10,
    supportsHostless: true,
  },
  'draw-guess': {
    id: 'draw-guess',
    name: 'Crtaj i pogodi',
    minPlayers: 2,
    maxPlayers: 8,
    description: 'Crtajte redom — ostali pogađaju reč!',
    icon: '🎨',
    accent: 'cyan',
    category: 'drawing',
    estimatedMinutes: 10,
    supportsHostless: true,
  },
  'fake-artist': {
    id: 'fake-artist',
    name: 'Lažni umetnik',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Svi crtaju istu reč po jedan potez — osim uljeza koji je ne zna. Pronađite lažnjaka!',
    icon: '🖌️',
    accent: 'pink',
    category: 'drawing-bluff',
    estimatedMinutes: 8,
    supportsHostless: true,
  },
  fibbage: {
    id: 'fibbage',
    name: 'Lažov',
    minPlayers: 2,
    maxPlayers: 8,
    description: 'Napiši lažan odgovor, pronađi pravi, prevari ostale!',
    icon: '🤥',
    accent: 'amber',
    category: 'bluff',
    estimatedMinutes: 10,
    supportsHostless: true,
  },
  'ko-bi-pre': {
    id: 'ko-bi-pre',
    name: 'Ko bi pre?',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Glasajte ko bi pre uradio nešto — poeni onima koji pogode većinu!',
    icon: '🤔',
    accent: 'lime',
    category: 'party',
    estimatedMinutes: 8,
    supportsHostless: true,
  },
  'dve-istine-i-laz': {
    id: 'dve-istine-i-laz',
    name: 'Dve istine i laž',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Svako napiše dve istine i jednu laž o sebi — ostali pogađaju šta je laž!',
    icon: '🎭',
    accent: 'pink',
    category: 'party',
    estimatedMinutes: 8,
    supportsHostless: true,
  },
  'slepi-telefoni': {
    id: 'slepi-telefoni',
    name: 'Slepi telefoni',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Napiši frazu, sledeći je crta, zatim sledeći pogađa — pogledajte kako se rečenica izvitoperi!',
    icon: '📝',
    accent: 'cyan',
    category: 'drawing',
    estimatedMinutes: 12,
    supportsHostless: true,
  },
  'ko-sam-ja': {
    id: 'ko-sam-ja',
    name: 'Ko sam ja?',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Lična pitanja o igračima — koliko dobro poznajete jedni druge?',
    icon: '🫂',
    accent: 'violet',
    category: 'party',
    estimatedMinutes: 10,
    supportsHostless: true,
  },
  'spot-it': {
    id: 'spot-it',
    name: 'Pronađi par',
    minPlayers: 2,
    maxPlayers: 12,
    description:
      'Tvoja karta i centralna karta dele tačno jedan simbol — pronađi ga prvi!',
    icon: '🔎',
    accent: 'danger',
    category: 'speed',
    estimatedMinutes: 5,
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
    icon: '🐺',
    accent: 'blue',
    category: 'team',
    estimatedMinutes: 20,
    supportsHostless: true,
  },
  'bolji-zivot': {
    id: 'bolji-zivot',
    // Retema: prikazno ime je "Zavet" (slovenska mitologija), interni id
    // ostaje bolji-zivot.
    name: 'Zavet',
    minPlayers: 2,
    maxPlayers: 6,
    description:
      'Kartaška igra pamćenja — 4 skrivene karte, menjaj ih, špijuniraj i vikni "Zavet!" kad nosiš najmanje uroka!',
    icon: '🃏',
    accent: 'amber',
    category: 'cards',
    estimatedMinutes: 15,
    // Hostless-capable: sve tajno (svoje karte, peek, ruka) je ionako na
    // telefonu; hostless režim samo prikaže javni sto i na kontrolerima.
    supportsHostless: true,
    // Uroci: manje poena = bolji plasman (rang liste sortirati rastuće).
    lowerScoreWins: true,
  },
  'tajni-agenti': {
    id: 'tajni-agenti',
    name: 'Tajni agenti',
    // Classic needs 4 (two teams × spymaster + guesser); the cooperative
    // duet/coop modes work from 2 — per-mode floors live in validateStart.
    minPlayers: 2,
    maxPlayers: 8,
    description:
      'Špijun daje šifru — pogađaj reči, ali pazi na ubicu! Klasik, Duet ili kooperativni mod — može i sa 2 igrača.',
    icon: '🕵️',
    accent: 'blue',
    category: 'team',
    estimatedMinutes: 15,
    // Hostless-capable: the controller renders the full board (interactive for
    // the active guesser, secret key for spymasters) and, in hostless rooms,
    // a read-only board for waiting players — everything the TV would show.
    supportsHostless: true,
  },
  spijun: {
    id: 'spijun',
    name: 'Špijun',
    minPlayers: 3,
    maxPlayers: 8,
    description:
      'Svi znaju tajnu lokaciju — osim špijuna! Ispitujte se, otkrijte uljeza pre nego što on pogodi gde ste.',
    icon: '🎩',
    accent: 'violet',
    category: 'bluff',
    estimatedMinutes: 12,
    // Hostless-capable: sve tajno (uloga, lokacija) je ionako na telefonu;
    // javna lista lokacija + optužbe + glasanje stižu i do kontrolera.
    supportsHostless: true,
  },
  asocijacije: {
    id: 'asocijacije',
    name: 'Asocijacije',
    minPlayers: 2,
    maxPlayers: 8,
    description:
      'TV Slagalica: 4 kolone × 4 polja i konačno rešenje. Otvaraj polja, pogađaj kolone i vikni konačno rešenje! Klasik ili kviz mod.',
    icon: '🧩',
    accent: 'gold',
    category: 'quiz',
    estimatedMinutes: 12,
    supportsHostless: true,
  },
  slozilica: {
    id: 'slozilica',
    name: 'Složilica',
    minPlayers: 2,
    maxPlayers: 10,
    description:
      'Slova su podeljena, vreme teče — složi najdužu reč koju umeš. Duže reči nose mnogo više poena!',
    icon: '🔤',
    accent: 'cyan',
    category: 'word',
    estimatedMinutes: 5,
    // Sve što treba je na telefonu (slova + unos), TV samo pojačava utisak.
    supportsHostless: true,
  },
  penali: {
    id: 'penali',
    name: 'Penali',
    minPlayers: 2,
    maxPlayers: 10,
    description:
      'Šutiraj penal ili brani gol — nišani, odmeri snagu i pogodi ćošak. Golman bira stranu naslepo!',
    icon: '⚽',
    accent: 'lime',
    category: 'action',
    estimatedMinutes: 8,
    // NOT hostless: the 3D replay of the shot on the TV is the whole payoff,
    // and a phone-only version would be two buttons and a text verdict.
    supportsHostless: false,
  },
  'hot-potato': {
    id: 'hot-potato',
    name: 'Vruć krompir',
    minPlayers: 2,
    maxPlayers: 12,
    description:
      'Bomba sa skrivenim tajmerom kruži — kaži reč iz kategorije i prosledi. Kod koga pukne, ispada!',
    icon: '🥔',
    accent: 'amber',
    category: 'speed',
    estimatedMinutes: 6,
    // Hostless-capable: sve javno (ko drži krompir, ko je živ, kategorija)
    // stiže i do telefona, pa se ceo tok vidi i bez TV-a.
    supportsHostless: true,
  },
};
