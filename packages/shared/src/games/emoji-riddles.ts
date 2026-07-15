import type { EmojiRiddle } from '../types/emoji-zagonetke.js';

/**
 * Built-in bank for „Emoji zagonetke". Answers are Serbian (Latin) by design,
 * like the other in-game content banks. `accept` lists common alternates
 * (English titles, alternate spellings). Matching is accent/punctuation
 * insensitive (see checkEmojiGuess).
 */
export const EMOJI_RIDDLES: readonly EmojiRiddle[] = [
  // --- films / cartoons ---
  { emojis: '🦁👑', answer: 'Kralj lavova', accept: ['The Lion King'] },
  { emojis: '❄️👸⛄', answer: 'Zaleđeno kraljevstvo', accept: ['Frozen'] },
  { emojis: '🕷️🧑', answer: 'Spajdermen', accept: ['Spiderman', 'Spider-Man', 'Čovek pauk'] },
  { emojis: '🦇🧑', answer: 'Betmen', accept: ['Batman'] },
  { emojis: '🚢🧊💔', answer: 'Titanik', accept: ['Titanic'] },
  { emojis: '🦖🏝️', answer: 'Park iz doba jure', accept: ['Jurassic Park'] },
  { emojis: '🐠🔍', answer: 'Potraga za Nemom', accept: ['Finding Nemo', 'Nemo'] },
  { emojis: '👽📞🏠', answer: 'I.T.', accept: ['ET', 'E.T.'] },
  { emojis: '🤖❤️🌱', answer: 'Vol-i', accept: ['Wall-E', 'WALL-E', 'Voli'] },
  { emojis: '🧙‍♂️💍🌋', answer: 'Gospodar prstenova', accept: ['The Lord of the Rings', 'Lord of the Rings'] },
  { emojis: '🦈🏖️😱', answer: 'Ajkula', accept: ['Jaws'] },
  { emojis: '👻🚫', answer: 'Istrebljivači duhova', accept: ['Ghostbusters'] },
  { emojis: '🐷🕸️', answer: 'Šarlotina mreža', accept: ["Charlotte's Web"] },
  { emojis: '🚗⚡👦', answer: 'Munjavi', accept: ['Cars', 'Automobili'] },
  { emojis: '🐭🍝👨‍🍳', answer: 'Pacov pod šeširom', accept: ['Ratatouille', 'Ratatuj'] },

  // --- phrases / sayings ---
  { emojis: '🌧️🐱🐶', answer: 'Pada kiša', accept: ['Kiša'] },
  { emojis: '🐔🥚', answer: 'Kokoška i jaje' },
  { emojis: '🍎📅', answer: 'Jabuka dnevno', accept: ['An apple a day'] },
  { emojis: '🐺🐑', answer: 'Vuk u jagnjećoj koži', accept: ['Vuk u ovčjoj koži'] },
  { emojis: '💰🌳', answer: 'Pare ne rastu na drveću' },
  { emojis: '🔥🚒', answer: 'Vatrogasci', accept: ['Vatrogasac'] },
  { emojis: '⏰🌅', answer: 'Ko rano rani, dve sreće grabi' },

  // --- things / concepts ---
  { emojis: '☕🥐', answer: 'Doručak' },
  { emojis: '🎂🎉🎈', answer: 'Rođendan' },
  { emojis: '⚽🥅', answer: 'Fudbal', accept: ['Gol'] },
  { emojis: '🏀🔨', answer: 'Košarka' },
  { emojis: '🎾🟢', answer: 'Tenis' },
  { emojis: '🍕🇮🇹', answer: 'Pica', accept: ['Pizza'] },
  { emojis: '🌍💧🔥🌪️', answer: 'Elementi', accept: ['Priroda'] },
  { emojis: '🚑🏥', answer: 'Bolnica', accept: ['Hitna pomoć'] },
  { emojis: '✈️🌴🧳', answer: 'Letovanje', accept: ['Odmor'] },
  { emojis: '🎄🎁⛄', answer: 'Božić', accept: ['Nova godina'] },
  { emojis: '🌙⭐😴', answer: 'Laku noć' },
  { emojis: '🐝🍯', answer: 'Med', accept: ['Pčela'] },
  { emojis: '🦉📚🎓', answer: 'Škola', accept: ['Fakultet'] },
  { emojis: '🎣🐟', answer: 'Pecanje', accept: ['Ribolov'] },
  { emojis: '🧛🩸🦇', answer: 'Vampir', accept: ['Drakula', 'Dracula'] },
  { emojis: '🌈🦄', answer: 'Jednorog', accept: ['Unicorn'] },
  { emojis: '☔🌈', answer: 'Duga' },
  { emojis: '🍫🏭🎫', answer: 'Čarli i fabrika čokolade', accept: ['Charlie and the Chocolate Factory'] },
  { emojis: '👑💍👰', answer: 'Venčanje', accept: ['Svadba'] },
];
