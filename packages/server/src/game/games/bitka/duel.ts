import type { BitkaDuelOutcome } from '@igra/shared';

/**
 * Razrešenje napada — čista funkcija, bez ikakvog stanja. Jedino mesto na kome
 * se odlučuje ko je dobio razmenu; modul samo primenjuje ishod na tablu.
 *
 * Držati ovo odvojeno se isplati iz istog razloga kao kod Gluvog doba: ishod
 * napada je pravilo koje se najčešće menja i najlakše pokvari, pa mora da bude
 * testabilno bez sobe, socketa i faza.
 */

export interface DuelSide {
  /**
   * Rezultat na pitanju; veće je bolje, 0 = ništa (i neodgovoreno). Izborno
   * pitanje daje 0 ili 1, matrica 0–3. Duel se rešava poređenjem OVOG broja,
   * pa stepenovani tipovi pitanja retko završe nerešeno — što je i razlog
   * zašto su pušteni u duel.
   */
  score: number;
  /**
   * Da li je odgovor prešao prag „dovoljno dobar" — kod izbornog pitanja to je
   * tačan odgovor, kod matrice bar dva pojma od tri. Bitno samo kad nema
   * branioca: tada nema šta da se poredi, pa odlučuje prag.
   */
  qualifies: boolean;
  /**
   * Koliko je sekundi ostalo kad je potvrdio; `null` znači da nije stigao.
   * Brzina rešava izjednačenje u broj-pitanju kad su odstupanja ista.
   */
  remaining: number | null;
  /**
   * Apsolutno odstupanje od tačnog broja u tiebreak pitanju; `null` = nije
   * odgovorio. Koristi se samo u `resolveBrojDuel`.
   */
  distance?: number | null;
}

export type DuelVerdict = 'napadac' | 'branilac' | 'tiebreak';

/**
 * Prvo pitanje duela, bilo kog tipa. Bolji rezultat uzima zemlju; isti
 * rezultat na obe strane ide na broj-pitanje — kao u Triviadoru.
 *
 * Za izborno pitanje su rezultati samo 0 i 1, pa je ovo doslovno staro
 * pravilo: tačan protiv netačnog nosi, oba tačna ili oba netačna su nerešena.
 * Stepenovani tipovi (matrica 0–3) time dobijaju razrešenje bez ijedne nove
 * grane — i ređe stižu do klizača, jer je 2:3 već odluka.
 *
 * Neutralna teritorija nema branioca: napadač je uzima ako je prešao prag,
 * inače ostaje neutralna. Bez tiebreak-a, jer nema s kim.
 */
export function resolveScoredDuel(
  attacker: DuelSide,
  defender: DuelSide | null
): DuelVerdict {
  if (!defender) return attacker.qualifies ? 'napadac' : 'branilac';
  if (attacker.score > defender.score) return 'napadac';
  if (defender.score > attacker.score) return 'branilac';
  return 'tiebreak';
}

/**
 * Broj-pitanje koje razrešava izjednačen duel: bliži pobeđuje, a na istom
 * odstupanju odlučuje brzina. Ko nije odgovorio nema šta da traži — ako nijedan
 * nije odgovorio, branilac drži (status quo, niko nije ništa zaradio).
 */
export function resolveBrojDuel(
  attacker: DuelSide,
  defender: DuelSide
): 'napadac' | 'branilac' {
  const a = attacker.distance;
  const d = defender.distance;
  const aOk = typeof a === 'number' && Number.isFinite(a);
  const dOk = typeof d === 'number' && Number.isFinite(d);

  if (!aOk && !dOk) return 'branilac';
  if (!aOk) return 'branilac';
  if (!dOk) return 'napadac';
  if (a! < d!) return 'napadac';
  if (d! < a!) return 'branilac';

  // Isto odstupanje — ko je bio brži. Na potpuno istom rezultatu branilac
  // drži, jer napad nije doneo prednost.
  const ar = attacker.remaining ?? -1;
  const dr = defender.remaining ?? -1;
  return ar > dr ? 'napadac' : 'branilac';
}

/**
 * Prevod „ko je dobio razmenu" u ishod na tabli. Napad na zamak ne uzima
 * zemlju odmah — ruši jedan zid, a tek poslednji zid predaje zamak.
 */
export function duelOutcome(
  attackerWon: boolean,
  onCastle: boolean,
  wallsBefore: number
): BitkaDuelOutcome {
  if (!attackerWon) return 'branilac';
  if (!onCastle) return 'napadac';
  return wallsBefore > 1 ? 'zid' : 'zamak-pao';
}
