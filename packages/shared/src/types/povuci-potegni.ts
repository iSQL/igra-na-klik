// Povuci-potegni — dva tima vuku konopac preko provalije. Svako na svom
// telefonu rešava svoj zadatak (matematika / fizika / hemija); tačan odgovor
// vuče čvor ka njegovom timu, netačan ga pomera ka protivniku i blokira 3 s.
//
// Anti-leak: tačan odgovor tekućeg zadatka NIKAD ne napušta server — telefon
// dobija samo tekst, jedinicu i (kod izbora) izmešane ponude. Tačan odgovor
// stiže tek u `promasaj`, posle pogrešnog pokušaja, i to samo tom igraču.

export type PotegniMode = 'timovi' | 'solo';
export type PotegniPredmet = 'matematika' | 'fizika' | 'hemija';
export type PotegniTezina = 'osnovna' | 'srednja' | 'mesovito';
export type PotegniBot = 'lak' | 'srednji' | 'tezak';
export type PotegniTim = 'crveni' | 'plavi';

/** timovi (samo u modu „Dva tima") → spremni → vuca → kraj → ended */
export type PotegniPhase = 'timovi' | 'spremni' | 'vuca' | 'kraj' | 'ended';

/** Zadatak kako ga vidi telefon — bez odgovora. */
export interface PotegniZadatak {
  /** Raste sa svakim novim zadatkom; telefon po njemu briše unos. */
  id: number;
  predmet: PotegniPredmet;
  tekst: string;
  /** Pitanje ispod formule, npr. „Koliki je koeficijent ispred H₂?". */
  podtekst?: string;
  /** Jedinica pored polja za unos (m/s, N, g/mol…). */
  jedinica?: string;
  /** Ponuđeni odgovori — tap odmah šalje. Bez njih telefon nudi tastaturu. */
  opcije?: string[];
}

export interface PotegniIgrac {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  tim: PotegniTim;
  connected: boolean;
}

/** Jedan potez u traci ispod tima na TV-u (✓ +¼ / ✕ 3 s). */
export interface PotegniPotez {
  id: number;
  /** 'bot' za bota u solo modu. */
  playerId: string;
  tim: PotegniTim;
  ok: boolean;
  /** Koliko je igrača tim imao u tom trenutku — TV piše korak kao 1/n. */
  udeo: number;
}

export interface PotegniStat {
  playerId: string;
  tim: PotegniTim;
  tacno: number;
  netacno: number;
  /** Prosečno vreme do tačnog odgovora, ms (0 = nijedan tačan). */
  prosekMs: number;
  /** 'munja' (najbrži u timu) / 'bez-greske' — oznake na kraju. */
  oznaka?: 'munja' | 'bez-greske';
}

export interface PotegniIshod {
  /** null = nerešeno (čvor ostao na sredini). */
  pobednik: PotegniTim | null;
  /** 'crta' = dovučen do crte, 'vreme' = isteklo vreme. */
  razlog: 'crta' | 'vreme';
  /** Sekundi do kraja kad je čvor stigao do crte. */
  preostalo: number;
}

export interface PotegniHostData {
  mode: PotegniMode;
  predmeti: PotegniPredmet[];
  tezina: PotegniTezina;
  bot?: PotegniBot;
  /** Trajanje vuče u sekundama (za traku i „0:46 pre kraja"). */
  trajanje: number;
  /** −100…100; pozitivno = ka crvenoj crti (levo), ±100 = crta. */
  pozicija: number;
  igraci: PotegniIgrac[];
  tacno: Record<PotegniTim, number>;
  netacno: Record<PotegniTim, number>;
  /** Poslednji potezi, najnoviji prvi. */
  potezi: PotegniPotez[];
  /** Ko je trenutno blokiran posle promašaja (TV ih prigušuje). */
  blokirani: string[];
  /** Solo: koliko je puta bot povukao. */
  botPoteza?: number;
  /** Ko drži kontrolu (pokreće igru iz izbora timova); null = samo TV. */
  kontrolaId?: string | null;
  ishod?: PotegniIshod;
  statistika?: PotegniStat[];
}

export interface PotegniControllerData {
  tim: PotegniTim;
  zadatak?: PotegniZadatak;
  /** Promašaj koji je upravo pokrenuo blokadu (id raste po promašaju). */
  promasaj?: { id: number; tekst: string; tacno: string; dato: string; ms: number };
  tacno: number;
  netacno: number;
  /** Tačnih zaredom. */
  niz: number;
  /** Poeni u ovoj partiji. */
  poeni: number;
}
