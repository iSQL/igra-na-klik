// Tutorial mod za "Bolji život!" — tekstovi vodiča (fazni hintovi za TV i
// telefon + "?" podsetnik pravila). Prikazuju se SAMO kad je igra pokrenuta
// sa boljiZivotTutorial flagom; obična partija ostaje čista. In-game sadržaj
// je namerno samo na srpskom (kao i ostatak igre).

import type { BoljiZivotPhase } from '../types/bolji-zivot.js';

/**
 * Opšti opis faze za TV / posmatrače — šta se upravo dešava na stolu.
 * Ključ je GameState.phase; faza koja nema unos ne prikazuje hint.
 */
export const BZ_TUTORIAL_PHASE_TEXT: Partial<Record<BoljiZivotPhase, string>> = {
  peeking:
    'Svako krišom gleda 2 od svoje 4 karte — zapamtite ih! Posle ovoga karte su tajna: pamćenje pozicija je cela igra.',
  'await-draw':
    'Igrač na potezu bira: vuče kartu sa špila, uzima otvorenu kartu sa otpada, ili — ako misli da ima najmanje oraha — viče „BOLJI ŽIVOT!“',
  holding:
    'Izvučenu kartu može da ZAMENI sa jednom svojom (stara ide na otpad) ili da je BACI. Karta 5–9 bačena direktno sa špila aktivira moć!',
  'power-select':
    'Moć je aktivirana — igrač bira metu. Moći: 5 gleda svoju, 6 gleda tuđu, 7 slepo menja, 8 racija, 9 gleda pa menja.',
  'power-look':
    'Igrač je pogledao tuđu kartu (moć 9) i sada odlučuje: da li da je zameni sa svojom ili ostavi.',
  'peek-show': 'Igrač pamti kartu koju je upravo video. Niko drugi je ne vidi!',
  'racija-show':
    'RACIJA! Svakom igraču se javno otkriva po jedna nasumična karta — svi gledajte i pamtite.',
  reaction:
    'Popara prozor: ciljani igrač može da tapne kartu za koju veruje da je Popara (12) i poništi akciju. Pogrešna karta = javno otkrivanje + kaznena karta!',
  riska:
    'Riska (13) se oglašava! Njen vlasnik dobija jedan dodatni potez pre otkrivanja: da je se reši ili uvali drugom.',
  reveal:
    'Otkrivanje! Sabiraju se orasi (manje je bolje). Pozivač „Boljeg života“ mora da bude STROGO najniži — inače zbir + 20 kazne. Malina+Ozren u istoj porodici vrede 0.',
  'final-leaderboard': 'Kraj partije — pobednik je igrač sa NAJMANJE oraha u džepu!',
};

/**
 * Personalizovani hint za telefon — šta baš TI sada možeš/treba da uradiš.
 * Bira se po fazi + ulozi (na potezu / meta / posmatrač).
 */
export function bzTutorialControllerHint(
  phase: BoljiZivotPhase,
  opts: { isMyTurn: boolean; amTargeted: boolean; amRiskaHolder: boolean }
): string | null {
  switch (phase) {
    case 'peeking':
      return 'Tapni 2 svoje karte, jednu po jednu, i DOBRO ih zapamti — kasnije ih više ne vidiš. Cilj: skupljaj male brojeve (0 je najbolje, 13 najgore).';
    case 'await-draw':
      return opts.isMyTurn
        ? 'Tvoj potez! „Vuci sa špila“ = tajna karta. „Uzmi sa otpada“ = vidiš šta uzimaš, ali NE aktivira moć. „BOLJI ŽIVOT!“ zovi samo ako si siguran da imaš najmanje oraha.'
        : 'Sačekaj svoj red — i drži oko na otpadu: kad neko baci kartu, otvara se SLAP prozor (ako imaš istu vrednost, možeš da je se rešiš!).';
    case 'holding':
      return opts.isMyTurn
        ? 'Zameni: tapni SVOJU kartu — držana ulazi na njeno mesto, stara ide na otpad. Baci: karta 5–9 bačena direktno aktivira svoju moć (piše na dugmetu).'
        : 'Igrač odlučuje šta će sa izvučenom kartom. Ako je baci, pazi na SLAP prozor!';
    case 'power-select':
      return opts.isMyTurn
        ? 'Aktivirao si moć — izaberi metu. Ovo je besplatna informacija ili haos: iskoristi je!'
        : 'Neko koristi moć. Ako cilja tvoju kartu, dobićeš Popara prozor da poništiš akciju (ako imaš Poparu i znaš gde je).';
    case 'power-look':
      return opts.isMyTurn
        ? 'Video si tuđu kartu. Ako je manja od neke tvoje (koje se sećaš) — zameni! Ako ne, ostavi.'
        : 'Igrač je video tuđu kartu i odlučuje da li da je uzme sebi.';
    case 'peek-show':
      return opts.isMyTurn
        ? 'Zapamti ovu kartu! Nestaće čim potvrdiš — više je niko neće prikazati.'
        : 'Igrač pamti šta je video — ti to ne vidiš.';
    case 'racija-show':
      return 'Zapamti SVE otkrivene karte — i svoje i tuđe. Ovo je najjeftinija informacija u igri.';
    case 'reaction':
      return opts.amTargeted
        ? 'Tvoja karta je na meti! Ako veruješ da je jedna od tvojih karata Popara (12), tapni je — akcija se poništava. Pogrešiš li: karta se javno otkriva + dobijaš kaznenu. Nesiguran? Pusti.'
        : 'Ciljani igrač razmišlja da li da rizikuje Popara odbijenicu.';
    case 'riska':
      return opts.amRiskaHolder
        ? 'Riska (13 oraha!) je kod tebe. Izvuci kartu umesto nje, uvali je drugom (on može Poparom da odbije!), ili je ostavi ako misliš da svejedno dobijaš.'
        : 'Vlasnik Riske igra dodatni potez — možda ti je upravo uvali!';
    case 'reveal':
      return 'Manje oraha = bolje. Pozivač mora biti STROGO najniži (nerešeno = pad, +20). Malina (10) + Ozren (11) zajedno u porodici = 0.';
    default:
      return null;
  }
}

export interface BZCheatSection {
  title: string;
  lines: string[];
}

/** Sadržaj "?" podsetnika na telefonu (tutorial mod). */
export const BZ_CHEATSHEET: BZCheatSection[] = [
  {
    title: '🎯 Cilj',
    lines: [
      'Karte su „orasi u džepu“ — MANJE je bolje (0 najbolje, 13 najgore).',
      'Imaš 4 karte licem nadole na fiksnim mestima 1–4. Na početku vidiš samo 2 — pamti!',
      'Kad misliš da imaš najmanje oraha za stolom, na svom potezu vikni „BOLJI ŽIVOT!“ — svi ostali igraju još po jedan potez, pa se sve otkriva.',
    ],
  },
  {
    title: '🎴 Potez',
    lines: [
      'Vuci sa špila (tajna karta) ili uzmi vrh otpada (vidiš je, ali bez moći).',
      'Zatim: ZAMENI je sa jednom svojom (stara ide na otpad) ili je BACI.',
      'Moć se aktivira SAMO kad kartu 5–9 izvučeš sa špila i baciš direktno.',
    ],
  },
  {
    title: '⚡ Moći (samo bačene direktno sa špila)',
    lines: [
      '5 · Kustudić 🚗 — pogledaj jednu SVOJU kartu',
      '6 · Ilija Pandurović 🔓 — pogledaj jednu TUĐU kartu',
      '7 · Aranđel Golubović 🌀 — slepa zamena: tvoja ⇄ tuđa, bez gledanja',
      '8 · Inspektor Naumović 🚨 — RACIJA: svakome se javno otkriva po jedna karta',
      '9 · Direktor Kurčubić 💼 — pogledaj tuđu, pa je po želji zameni sa svojom',
    ],
  },
  {
    title: '🃏 Specijalne karte',
    lines: [
      'Malina (10) 💋 + Ozren (11) 🕴️ u istoj porodici → par vredi 0.',
      'Popara (12) 📋 — kad neko cilja tvoju kartu, tapni Poparu i poništi akciju („pišite odbijenicu!“). Promašaj = otkrivanje + kaznena karta.',
      'Riska (13) 👵 — 13 oraha! Pred otkrivanje se oglašava: vlasnik dobija dodatni potez da je se reši ili uvali.',
    ],
  },
  {
    title: '⚡ SLAP prozor',
    lines: [
      'Kad na otpad padne karta 0–9, na par sekundi svako sme da tapne SVOJU kartu iste vrednosti — ona odlazi na otpad (porodica ti se smanjuje!).',
      'Promašaj: karta se javno otkriva + dobijaš kaznenu kartu. Slapuj samo kad si siguran.',
    ],
  },
  {
    title: '🏁 Kraj runde',
    lines: [
      'Pozivač „Boljeg života“ mora biti STROGO najniži → njegova runda vredi 0.',
      'Ako nije najniži: zbir + 20 kazne, a najniži protivnik dobija 0.',
      'Posle svih rundi pobednik je igrač sa NAJMANJE oraha ukupno.',
    ],
  },
];
