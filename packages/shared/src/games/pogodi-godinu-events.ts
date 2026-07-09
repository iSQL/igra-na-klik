import type { PogodiBrojQuestion } from '../types/pogodi-godinu.js';

// Built-in question bank for "Pogodi broj". Serbian (Latin) — the in-game
// screen is Serbian by design. Every question carries its own [min, max]
// slider range, so the bank freely mixes years, prices, distances, weights,
// durations and counting questions. The built-in bank has no images (only
// admin packs do). Curated for recognizability, not obscurity.
export const POGODI_BROJ_QUESTIONS: PogodiBrojQuestion[] = [
  // --- Godine (raspon 1900–2025) -----------------------------------------
  { text: 'Prvi čovek na Mesecu', answer: 1969, min: 1900, max: 2025, unit: 'god.', emoji: '🚀' },
  { text: 'Pad Berlinskog zida', answer: 1989, min: 1900, max: 2025, unit: 'god.', emoji: '🧱' },
  { text: 'Potonuće Titanika', answer: 1912, min: 1900, max: 2025, unit: 'god.', emoji: '🚢' },
  { text: 'Početak Prvog svetskog rata', answer: 1914, min: 1900, max: 2025, unit: 'god.', emoji: '⚔️' },
  { text: 'Kraj Drugog svetskog rata', answer: 1945, min: 1900, max: 2025, unit: 'god.', emoji: '🕊️' },
  { text: 'Jurij Gagarin — prvi čovek u svemiru', answer: 1961, min: 1900, max: 2025, unit: 'god.', emoji: '👨‍🚀' },
  { text: 'Černobiljska katastrofa', answer: 1986, min: 1900, max: 2025, unit: 'god.', emoji: '☢️' },
  { text: 'Zimske olimpijske igre u Sarajevu', answer: 1984, min: 1900, max: 2025, unit: 'god.', emoji: '⛷️' },
  { text: 'NATO bombardovanje SRJ', answer: 1999, min: 1900, max: 2025, unit: 'god.', emoji: '✈️' },
  { text: 'Predstavljen prvi iPhone', answer: 2007, min: 1900, max: 2025, unit: 'god.', emoji: '📱' },
  { text: 'Osnovan Facebook', answer: 2004, min: 1900, max: 2025, unit: 'god.', emoji: '👍' },
  { text: 'Pokrenut YouTube', answer: 2005, min: 1900, max: 2025, unit: 'god.', emoji: '▶️' },
  { text: 'Osnovan Google', answer: 1998, min: 1900, max: 2025, unit: 'god.', emoji: '🔍' },
  { text: 'Pokrenuta Vikipedija', answer: 2001, min: 1900, max: 2025, unit: 'god.', emoji: '📚' },
  { text: 'Aleksandar Fleming otkrio penicilin', answer: 1928, min: 1900, max: 2025, unit: 'god.', emoji: '💊' },
  { text: 'Prvi let braće Rajt', answer: 1903, min: 1900, max: 2025, unit: 'god.', emoji: '🛩️' },
  { text: 'Ford Model T stigao na tržište', answer: 1908, min: 1900, max: 2025, unit: 'god.', emoji: '🚗' },
  { text: 'Smrt Josipa Broza Tita', answer: 1980, min: 1900, max: 2025, unit: 'god.', emoji: '🕯️' },
  { text: 'Crvena zvezda osvojila Kup šampiona', answer: 1991, min: 1900, max: 2025, unit: 'god.', emoji: '⚽' },
  { text: 'Jugoslavija prvak sveta u košarci', answer: 2002, min: 1900, max: 2025, unit: 'god.', emoji: '🏀' },
  { text: 'Novak Đoković osvojio prvi Grend slem', answer: 2008, min: 1900, max: 2025, unit: 'god.', emoji: '🎾' },
  { text: 'Novak Đoković prvi put broj 1 na svetu', answer: 2011, min: 1900, max: 2025, unit: 'god.', emoji: '🏆' },
  { text: 'Početak pandemije korona virusa', answer: 2020, min: 1900, max: 2025, unit: 'god.', emoji: '😷' },
  { text: 'Atomska bomba bačena na Hirošimu', answer: 1945, min: 1900, max: 2025, unit: 'god.', emoji: '💥' },
  { text: 'Ubistvo Džona Kenedija', answer: 1963, min: 1900, max: 2025, unit: 'god.', emoji: '🎯' },
  { text: 'Prva presađena ljudsko srce (Barnard)', answer: 1967, min: 1900, max: 2025, unit: 'god.', emoji: '❤️' },
  { text: 'Otkrivena struktura DNK', answer: 1953, min: 1900, max: 2025, unit: 'god.', emoji: '🧬' },
  { text: 'Prvi mobilni telefonski poziv', answer: 1973, min: 1900, max: 2025, unit: 'god.', emoji: '📞' },
  { text: 'Izašao prvi Windows', answer: 1985, min: 1900, max: 2025, unit: 'god.', emoji: '🪟' },
  { text: 'Premijera prvog „Ratovi zvezda" filma', answer: 1977, min: 1900, max: 2025, unit: 'god.', emoji: '⭐' },
  { text: 'Premijera filma „Titanik"', answer: 1997, min: 1900, max: 2025, unit: 'god.', emoji: '🎬' },
  { text: 'Objavljena prva knjiga o Hariju Poteru', answer: 1997, min: 1900, max: 2025, unit: 'god.', emoji: '⚡' },
  { text: 'Prva epizoda „Simpsonovih"', answer: 1989, min: 1900, max: 2025, unit: 'god.', emoji: '📺' },
  { text: 'Prvi festival EXIT', answer: 2000, min: 1900, max: 2025, unit: 'god.', emoji: '🎵' },
  { text: 'Univerzijada u Beogradu', answer: 2009, min: 1900, max: 2025, unit: 'god.', emoji: '🏅' },
  { text: 'Referendum o Bregzitu', answer: 2016, min: 1900, max: 2025, unit: 'god.', emoji: '🇬🇧' },
  { text: 'Barak Obama izabran za predsednika SAD', answer: 2008, min: 1900, max: 2025, unit: 'god.', emoji: '🇺🇸' },
  { text: 'Lansiran ChatGPT', answer: 2022, min: 1900, max: 2025, unit: 'god.', emoji: '🤖' },
  { text: 'Pokémon GO postao svetski hit', answer: 2016, min: 1900, max: 2025, unit: 'god.', emoji: '🎮' },
  { text: 'Uveden evro kao gotovina', answer: 2002, min: 1900, max: 2025, unit: 'god.', emoji: '💶' },
  { text: 'Ajnštajnova opšta teorija relativnosti', answer: 1915, min: 1900, max: 2025, unit: 'god.', emoji: '🧠' },
  { text: 'Srbija postala samostalna država', answer: 2006, min: 1900, max: 2025, unit: 'god.', emoji: '🇷🇸' },
  { text: 'Valentina Tereškova — prva žena u svemiru', answer: 1963, min: 1900, max: 2025, unit: 'god.', emoji: '👩‍🚀' },
  { text: 'Smrt Majkla Džeksona', answer: 2009, min: 1900, max: 2025, unit: 'god.', emoji: '🎤' },
  { text: 'Svetsko prvenstvo u fudbalu u Nemačkoj', answer: 2006, min: 1900, max: 2025, unit: 'god.', emoji: '🏆' },
  { text: 'Letnje olimpijske igre u Pekingu', answer: 2008, min: 1900, max: 2025, unit: 'god.', emoji: '🥇' },
  { text: 'Otkriće Amerike (Kolumbo)', answer: 1492, min: 1000, max: 1900, unit: 'god.', emoji: '⛵' },
  { text: 'Gutenberg izumeo štampariju', answer: 1440, min: 1300, max: 1600, unit: 'god.', emoji: '🖨️' },

  // --- Rastojanja / veličine ---------------------------------------------
  { text: 'Ukupna dužina reke Dunav', answer: 2850, min: 500, max: 4000, step: 10, unit: 'km', emoji: '🌊' },
  { text: 'Dužina reke Save', answer: 990, min: 200, max: 2000, step: 10, unit: 'km', emoji: '🏞️' },
  { text: 'Visina Ajfelove kule', answer: 330, min: 100, max: 600, step: 5, unit: 'm', emoji: '🗼' },
  { text: 'Visina najvišeg vrha Kopaonika (Pančićev vrh)', answer: 2017, min: 500, max: 3000, step: 10, unit: 'm', emoji: '⛰️' },
  { text: 'Dužina maratonske trke', answer: 42, min: 10, max: 100, unit: 'km', emoji: '🏃' },

  // --- Težine / temperature ----------------------------------------------
  { text: 'Prosečna težina odraslog slona', answer: 5000, min: 500, max: 10000, step: 100, unit: 'kg', emoji: '🐘' },
  { text: 'Temperatura ključanja vode', answer: 100, min: 0, max: 300, unit: '°C', emoji: '🌡️' },

  // --- Cene / brojevi ----------------------------------------------------
  { text: 'Prosečna cena vekne hleba u Srbiji', answer: 60, min: 20, max: 200, step: 5, unit: 'din', emoji: '🍞' },
  { text: 'Broj kostiju u odraslom ljudskom telu', answer: 206, min: 50, max: 400, unit: 'kostiju', emoji: '🦴' },
  { text: 'Broj dana u godini', answer: 365, min: 100, max: 500, unit: 'dana', emoji: '📆' },
  { text: 'Broj dirki na klaviru', answer: 88, min: 20, max: 150, unit: 'dirki', emoji: '🎹' },
  { text: 'Broj žica na klasičnoj gitari', answer: 6, min: 1, max: 20, unit: 'žica', emoji: '🎸' },
  { text: 'Broj fudbalera jednog tima na terenu', answer: 11, min: 1, max: 30, unit: 'igrača', emoji: '⚽' },
  { text: 'Koliko slova „A" ima u reči „ananas"', answer: 3, min: 0, max: 8, unit: 'slova', emoji: '🅰️' },

  // --- Trajanja (mm:ss) --------------------------------------------------
  { text: 'Trajanje pesme „Bohemian Rhapsody"', answer: 355, min: 60, max: 480, step: 5, valueType: 'duration', emoji: '🎵' },
  { text: 'Trajanje pesme „Đurđevdan" (Bijelo dugme)', answer: 275, min: 60, max: 480, step: 5, valueType: 'duration', emoji: '🎶' },
];
