export interface PogodiGodinuEvent {
  text: string;
  year: number;
  emoji?: string;
}

// Built-in event bank for "Pogodi godinu". Serbian (Latin) — the in-game
// screen is Serbian by design. All years fall within [1900, 2025] so they
// sit on the slider range. Curated for recognizability, not obscurity.
export const POGODI_GODINU_EVENTS: PogodiGodinuEvent[] = [
  { text: 'Prvi čovek na Mesecu', year: 1969, emoji: '🚀' },
  { text: 'Pad Berlinskog zida', year: 1989, emoji: '🧱' },
  { text: 'Potonuće Titanika', year: 1912, emoji: '🚢' },
  { text: 'Početak Prvog svetskog rata', year: 1914, emoji: '⚔️' },
  { text: 'Kraj Drugog svetskog rata', year: 1945, emoji: '🕊️' },
  { text: 'Jurij Gagarin — prvi čovek u svemiru', year: 1961, emoji: '👨‍🚀' },
  { text: 'Černobiljska katastrofa', year: 1986, emoji: '☢️' },
  { text: 'Zimske olimpijske igre u Sarajevu', year: 1984, emoji: '⛷️' },
  { text: 'NATO bombardovanje SRJ', year: 1999, emoji: '✈️' },
  { text: 'Predstavljen prvi iPhone', year: 2007, emoji: '📱' },
  { text: 'Osnovan Facebook', year: 2004, emoji: '👍' },
  { text: 'Pokrenut YouTube', year: 2005, emoji: '▶️' },
  { text: 'Osnovan Google', year: 1998, emoji: '🔍' },
  { text: 'Pokrenuta Vikipedija', year: 2001, emoji: '📚' },
  { text: 'Aleksandar Fleming otkrio penicilin', year: 1928, emoji: '💊' },
  { text: 'Prvi let braće Rajt', year: 1903, emoji: '🛩️' },
  { text: 'Ford Model T stigao na tržište', year: 1908, emoji: '🚗' },
  { text: 'Smrt Josipa Broza Tita', year: 1980, emoji: '🕯️' },
  { text: 'Crvena zvezda osvojila Kup šampiona', year: 1991, emoji: '⚽' },
  { text: 'Jugoslavija prvak sveta u košarci', year: 2002, emoji: '🏀' },
  { text: 'Novak Đoković osvojio prvi Grend slem', year: 2008, emoji: '🎾' },
  { text: 'Novak Đoković prvi put broj 1 na svetu', year: 2011, emoji: '🏆' },
  { text: 'Početak pandemije korona virusa', year: 2020, emoji: '😷' },
  { text: 'Atomska bomba bačena na Hirošimu', year: 1945, emoji: '💥' },
  { text: 'Ubistvo Džona Kenedija', year: 1963, emoji: '🎯' },
  { text: 'Prva presađena ljudsko srce (Barnard)', year: 1967, emoji: '❤️' },
  { text: 'Otkrivena struktura DNK', year: 1953, emoji: '🧬' },
  { text: 'Prvi mobilni telefonski poziv', year: 1973, emoji: '📞' },
  { text: 'Izašao prvi Windows', year: 1985, emoji: '🪟' },
  { text: 'Premijera prvog „Ratovi zvezda" filma', year: 1977, emoji: '⭐' },
  { text: 'Premijera filma „Titanik"', year: 1997, emoji: '🎬' },
  { text: 'Objavljena prva knjiga o Hariju Poteru', year: 1997, emoji: '⚡' },
  { text: 'Prva epizoda „Simpsonovih"', year: 1989, emoji: '📺' },
  { text: 'Prvi festival EXIT', year: 2000, emoji: '🎵' },
  { text: 'Univerzijada u Beogradu', year: 2009, emoji: '🏅' },
  { text: 'Referendum o Bregzitu', year: 2016, emoji: '🇬🇧' },
  { text: 'Barak Obama izabran za predsednika SAD', year: 2008, emoji: '🇺🇸' },
  { text: 'Lansiran ChatGPT', year: 2022, emoji: '🤖' },
  { text: 'Pokémon GO postao svetski hit', year: 2016, emoji: '🎮' },
  { text: 'Uveden evro kao gotovina', year: 2002, emoji: '💶' },
  { text: 'Ajnštajnova opšta teorija relativnosti', year: 1915, emoji: '🧠' },
  { text: 'Srbija postala samostalna država', year: 2006, emoji: '🇷🇸' },
  { text: 'Valentina Tereškova — prva žena u svemiru', year: 1963, emoji: '👩‍🚀' },
  { text: 'Smrt Majkla Džeksona', year: 2009, emoji: '🎤' },
  { text: 'Svetsko prvenstvo u fudbalu u Nemačkoj', year: 2006, emoji: '🏆' },
  { text: 'Letnje olimpijske igre u Pekingu', year: 2008, emoji: '🥇' },
];
