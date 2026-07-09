// Klijentski tipovi za "Bolji život!" — oblik gameState.data (javno, stiže
// svima kroz game:state-update) i gameState.playerData (privatni isečak).
// ANTI-LEAK pravilo: u BoljiZivotHostData NIKAD ne sme lice karte koje nije
// javno otkriveno (racija, promašen slap/Popara, otpad, završno otkrivanje).
// Privatna viđenja (peek, look-swap, karta u ruci) idu isključivo kroz
// BoljiZivotPlayerData i žive samo dok traje pod-faza u kojoj su nastala —
// posle isteka se NE reemituju (pamćenje je deo igre).

import type { BZCardInfo, BoljiZivotPowerKind } from '../games/bolji-zivot-deck.js';

/** Pod-faza = GameState.phase (ravan string, GameRouter ne zavisi od njega). */
export type BoljiZivotPhase =
  | 'peeking' // početno gledanje 2 svoje karte
  | 'await-draw' // igrač na potezu bira: vuci / uzmi sa otpada / BOLJI ŽIVOT!
  | 'holding' // drži izvučenu kartu: zameni ili baci
  | 'power-select' // bira metu moći (5/6/7/9)
  | 'power-look' // 9: video tuđu kartu, bira zameni/ne
  | 'peek-show' // kratka pauza dok akter pamti viđeno (5/6)
  | 'racija-show' // 8: javno otkrivene karte na stolu
  | 'reaction' // Popara prozor za ciljanog igrača
  | 'riska' // Riska se oglašava — dodatni potez vlasnika
  | 'reveal' // otkrivanje porodica + bodovi runde
  | 'final-leaderboard'
  | 'ended';

/** Javni opis jednog mesta u porodici — present=false je rupa (slap/kazna). */
export interface BZSlotPublic {
  pos: number;
  present: boolean;
}

export interface BZFamilyPublic {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji?: string;
  connected: boolean;
  slots: BZSlotPublic[];
  isCaller: boolean;
}

/** Javno otkrivena karta (racija, promašen slap, otkrivanje). */
export interface BZRevealedCard extends BZCardInfo {
  playerId: string;
  pos: number;
}

export interface BZSlapPublic {
  /** Vrednost koju treba pogoditi (vrh otpada u trenutku otvaranja). */
  value: number;
  secondsLeft: number;
  winnerId: string | null;
  winnerName: string | null;
  /** Promašaji — javno otkrivene karte + kaznena karta za svakog. */
  failed: BZRevealedCard[];
}

export interface BZReactionPublic {
  targetPlayerId: string;
  targetName: string;
  actorId: string;
  actorName: string;
  kind: 'peek-other' | 'blind-swap' | 'look-swap' | 'riska-swap';
  /** Ciljana pozicija u porodici mete (javna informacija). */
  targetPos: number;
  /** Za blind-swap / riska-swap: akterova strana zamene (javno). */
  actorPos?: number;
}

export interface BZRevealFamilyCard extends BZCardInfo {
  pos: number;
  /** Deo Malina+Ozren para → vredi 0. */
  paired: boolean;
}

export interface BZRevealFamily {
  playerId: string;
  name: string;
  avatarColor: string;
  cards: BZRevealFamilyCard[];
  roundSum: number;
  /** Orasi dodati ovom rundom (0 za pobednika, zbir+20 za palog pozivača). */
  scoreAdded: number;
  totalScore: number;
  isCaller: boolean;
}

export interface BZLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  /** Ukupno oraha — MANJE je bolje, lista je rastuće sortirana. */
  score: number;
  rank: number;
}

export interface BoljiZivotHostData {
  sub: BoljiZivotPhase;
  roundNumber: number;
  totalRounds: number;
  turnOrder: string[];
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  families: BZFamilyPublic[];
  drawCount: number;
  discardCount: number;
  discardTop: BZCardInfo | null;
  calledBy: string | null;
  callerName: string | null;
  /** Poslednji javni događaj na stolu (srpski, gradi ga server). */
  lastAction: string | null;
  /** Raste sa svakim novim događajem — klijenti animiraju na promenu. */
  lastActionId: number;
  /**
   * Pozicije javno dirnute poslednjom akcijom — vlasnikovo pamćenje tih
   * mesta je od sada nevažeće, klijenti ih ističu.
   */
  changedSlots: { playerId: string; pos: number }[];
  /** Aktivna moć (power-select / power-look) — javno "X bira metu". */
  power: { actorId: string; actorName: string; kind: BoljiZivotPowerKind; v: number } | null;
  /** Paralelni slap prozor — nezavisan od pod-faze poteza. */
  slap: BZSlapPublic | null;
  reaction: BZReactionPublic | null;
  /** Racija — javno otkrivene karte (traje koliko i racija-show). */
  racija: { reveals: BZRevealedCard[] } | null;
  riska: { holderId: string; holderName: string } | null;
  reveal: {
    families: BZRevealFamily[];
    callerId: string | null;
    callerName: string | null;
    /** null = runda istekla bez poziva (bezbednosni limit poteza). */
    callerSuccess: boolean | null;
    winnerIds: string[];
  } | null;
  leaderboard: BZLeaderboardEntry[] | null;
}

export interface BoljiZivotPlayerData {
  /** Moja mesta (pos + da li je karta još tu). */
  mySlots: BZSlotPublic[];
  /**
   * Karte koje trenutno smem da vidim (početni peek, moć 5/6/9). Žive samo
   * dok traje pod-faza — server ih briše na prelazu i ne reemituje.
   */
  visible: BZRevealedCard[];
  /** Koliko još početnih peek-ova imam (samo tokom 'peeking'). */
  peeksLeft?: number;
  /** Karta koju držim u ruci (samo ja je vidim). */
  held?: BZCardInfo | null;
  heldFromDiscard?: boolean;
  isMyTurn: boolean;
  /** Smem li da pokušam slap u aktivnom prozoru. */
  canSlap: boolean;
  /** Popara prozor je moj (ja sam ciljan). */
  amTargeted: boolean;
  /** Ja sam vlasnik Riske tokom 'riska' pod-faze. */
  amRiskaHolder: boolean;
  /** Moji ukupni orasi. */
  myScore: number;
}
