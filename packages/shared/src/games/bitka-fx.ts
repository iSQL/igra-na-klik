import type { BitkaHostData, BitkaPoint, BitkaTerritoryState } from '../types/bitka.js';

/**
 * Prevođenje stanja igre u spisak vizuelnih događaja.
 *
 * Ovo je namerno **čista funkcija bez ijedne veze sa prikazom** i bez ijednog
 * novog socket eventa: sve što se animira već stoji u `BitkaHostData` (ishod
 * duela, vlasnik teritorije, pobednik). Zato živi u `shared` — TV je koristi
 * za 3D teren i efekte, telefon za bleskanje teritorije i vibraciju, i oba
 * govore istim rečnikom događaja.
 *
 * Okidanje ide isključivo na **razliku dva uzastopna stanja**, pa se svaki
 * događaj odigra tačno jednom. Ponovljeno stanje (reconnect, replay faze) ne
 * proizvodi ništa, jer razlike nema.
 */

export type BitkaFxKind =
  | 'napad'        // projektil od napadača ka meti
  | 'mac'          // napad je prošao — mač ulazi u kadar i zabija se u metu
  | 'stit'         // napad je odbijen — štit ulazi isto tako
  | 'osvojeno'     // teritorija promenila vlasnika
  | 'odbranjeno'   // napad odbijen
  | 'zid'          // zamak izgubio zid
  | 'zamak-pao'    // zamak srušen, igrač ispao
  | 'pobeda';      // kraj bitke

/** Koliko projektil leti — udar se kasni tačno toliko. */
export const FX_SHOT_SECONDS = 0.55;
/**
 * Koliko mač odnosno štit pada dok ne udari u teritoriju.
 *
 * Sve posledice udara (zid nestaje, teritorija menja boju) čekaju tačno
 * toliko: prvo se vidi ČIME je odlučeno, pa tek onda ŠTA se promenilo. Bez
 * ovoga zid nestane dok oružje još leti, pa udarac pada u prazno.
 */
export const FX_SLAM_SECONDS = 0.45;
/** Razmak između teritorija u talasu posle pada zamka. */
const FX_KASKADA_KORAK = 0.22;
/** Koliko se čeka od eksplozije zamka do prve teritorije u talasu. */
const FX_KASKADA_POCETAK = 0.5;

export interface BitkaFxEvent {
  /** Raste monotono — scena po njemu zna šta je već odigrala. */
  id: number;
  kind: BitkaFxKind;
  /** Meta efekta u normalizovanim koordinatama [0,1] nad slikom mape. */
  at: BitkaPoint;
  /** Teritorija na koju se efekat odnosi — 3D scena po njoj ruši zamak i zid. */
  territoryId?: string;
  /** Polazište napada; null kad se ne zna (napadač bez teritorije na mapi). */
  from?: BitkaPoint | null;
  /** Boja izvođača — napadača, odnosno novog vlasnika. */
  color: string;
}

export interface BitkaFxSnapshot {
  phase: string;
  host: BitkaHostData;
}

const NEUTRAL = '#8a91a2';

/**
 * @param prev  prethodni snimak; `null` znači prvi — tada se ništa ne animira,
 *              da ulazak u sobu usred partije ne ispali gomilu efekata odjednom
 * @param next  tekući snimak
 * @param nextId brojač koji dodeljuje id-jeve
 */
export function deriveFxEvents(
  prev: BitkaFxSnapshot | null,
  next: BitkaFxSnapshot,
  nextId: () => number
): BitkaFxEvent[] {
  const out: BitkaFxEvent[] = [];
  if (!prev) return out;

  const labelOf = (id: string | null | undefined): BitkaPoint | null =>
    next.host.map.territories.find((t) => t.id === id)?.label ?? null;
  const colorOf = (playerId: string | null | undefined): string =>
    next.host.players.find((p) => p.playerId === playerId)?.avatarColor ?? NEUTRAL;

  // 1) Ishod duela — prelaz „duel bez ishoda" → „duel sa ishodom".
  const duel = next.host.duel;
  const prevDuel = prev.host.duel;
  const sameDuel =
    !!duel &&
    !!prevDuel &&
    prevDuel.territoryId === duel.territoryId &&
    prevDuel.attackerId === duel.attackerId;
  if (duel?.outcome && !(sameDuel && prevDuel?.outcome)) {
    const at = labelOf(duel.territoryId);
    if (at) {
      const from = attackOrigin(next.host, duel.attackerId, at);
      const attacker = colorOf(duel.attackerId);
      const on = duel.territoryId;
      out.push({ id: nextId(), kind: 'napad', at, territoryId: on, from, color: attacker });
      // Krupno oružje ide uz svaki ishod duela — ono je taj ishod izgovoren
      // slikom: mač kad je napad prošao, štit kad je odbijen. Zato stoji ovde
      // a ne uz promenu vlasnika: miran izbor slobodne teritorije nije udarac.
      if (duel.outcome === 'branilac') {
        out.push({
          id: nextId(),
          kind: 'stit',
          at,
          territoryId: on,
          from,
          color: colorOf(duel.defenderId),
        });
      } else {
        out.push({ id: nextId(), kind: 'mac', at, territoryId: on, from, color: attacker });
      }
      if (duel.outcome === 'branilac') {
        out.push({
          id: nextId(),
          kind: 'odbranjeno',
          at,
          territoryId: on,
          from,
          color: colorOf(duel.defenderId),
        });
      } else if (duel.outcome === 'zid') {
        out.push({ id: nextId(), kind: 'zid', at, territoryId: on, from, color: attacker });
      } else if (duel.outcome === 'zamak-pao') {
        out.push({ id: nextId(), kind: 'zamak-pao', at, territoryId: on, from, color: attacker });
      }
      // Ishod 'napadac' nema svoj efekat — pokriva ga promena vlasnika ispod,
      // koja se dešava u istom trenutku.
    }
  }

  // 2) Promena vlasnika — istim putem se animira i osvajanje iz duela i miran
  //    izbor slobodne teritorije, jer je za gledaoca to isti događaj.
  const before = new Map(prev.host.board.map((st) => [st.id, st.ownerId ?? null]));
  for (const st of next.host.board) {
    const had = before.get(st.id);
    if (had === undefined) continue; // teritorija se pojavila tek sad — ne animiraj
    const now = st.ownerId ?? null;
    if (!now || had === now) continue;
    const at = labelOf(st.id);
    if (at) out.push({ id: nextId(), kind: 'osvojeno', at, territoryId: st.id, color: colorOf(now) });
  }

  // 3) Kraj bitke.
  if (!prev.host.winnerId && next.host.winnerId) {
    const at = castleOf(next.host, next.host.winnerId) ?? labelOf(next.host.board[0]?.id);
    if (at) out.push({ id: nextId(), kind: 'pobeda', at, color: colorOf(next.host.winnerId) });
  }

  return out;
}

/**
 * Kad se svaki događaj iz grupe pušta.
 *
 * Vremenski raspored je isti za TV i za telefon, pa stoji ovde a ne u sceni:
 *
 * - udar čeka da projektil stigne;
 * - **pad zamka pokreće talas** — sve teritorije koje su tog trena promenile
 *   vlasnika pale se jedna za drugom, jer padom zamka cela zemlja menja
 *   gospodara i to mora da se vidi kao jedan događaj, a ne kao tihi prelom
 *   boje na pola mape.
 */
export function planFxTiming(
  events: BitkaFxEvent[]
): { event: BitkaFxEvent; delay: number }[] {
  const shot = events.some((e) => e.kind === 'napad') ? FX_SHOT_SECONDS : 0;
  // Oružje kreće kad projektil stigne, a posledice čekaju da ono udari.
  const slam = events.some((e) => e.kind === 'mac' || e.kind === 'stit') ? FX_SLAM_SECONDS : 0;
  const impact = shot + slam;
  const fall = events.find((e) => e.kind === 'zamak-pao');
  let step = 0;
  return events.map((event) => {
    if (event.kind === 'napad') return { event, delay: 0 };
    if (event.kind === 'mac' || event.kind === 'stit') return { event, delay: shot };
    if (event.kind !== 'osvojeno') return { event, delay: impact };
    if (!fall) return { event, delay: impact };
    const delay = impact + FX_KASKADA_POCETAK + step * FX_KASKADA_KORAK;
    step += 1;
    return { event, delay };
  });
}

/**
 * Šta se na mapi **zadržava na starom izgledu** dok animacija ne stigne.
 *
 * Stanje sa servera nosi već promenjenog vlasnika, a efekti kasne (projektil
 * leti, talas se širi) — pa bi bez ovoga teritorija prvo tiho promenila boju, a
 * bljesak stigao sekundu kasnije, na već osvojeno. Redosled mora biti obrnut:
 * prvo udar, pa promena.
 *
 * Vraća prethodno stanje teritorije i koliko dugo ga treba prikazivati. Isto
 * važi i za zid — brojač zidova pada tačno kad plane vatra, ne pre.
 */
export function planFxHolds(
  prevBoard: BitkaTerritoryState[] | null | undefined,
  events: BitkaFxEvent[]
): { territoryId: string; state: BitkaTerritoryState; delay: number }[] {
  if (!prevBoard?.length) return [];
  const before = new Map(prevBoard.map((st) => [st.id, st]));
  const out: { territoryId: string; state: BitkaTerritoryState; delay: number }[] = [];
  for (const { event, delay } of planFxTiming(events)) {
    if (event.kind !== 'osvojeno' && event.kind !== 'zid') continue;
    if (!event.territoryId || delay <= 0) continue;
    const state = before.get(event.territoryId);
    if (state) out.push({ territoryId: event.territoryId, state, delay });
  }
  return out;
}

/**
 * Odakle kreće napad: najbliža teritorija napadača, jer se napada preko
 * granice — projektil koji poleti sa drugog kraja mape izgleda nasumično.
 * Kad napadač nema nijednu (ne bi trebalo), vraća null i scena baca odozgo.
 */
function attackOrigin(
  host: BitkaHostData,
  attackerId: string,
  target: BitkaPoint
): BitkaPoint | null {
  const labels = new Map(host.map.territories.map((t) => [t.id, t.label]));
  let best: BitkaPoint | null = null;
  let bestDist = Infinity;
  for (const st of host.board) {
    if (st.ownerId !== attackerId) continue;
    const p = labels.get(st.id);
    if (!p) continue;
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d > 0 && d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function castleOf(host: BitkaHostData, playerId: string): BitkaPoint | null {
  const st = host.board.find((s) => s.castle && s.ownerId === playerId);
  if (!st) return null;
  return host.map.territories.find((t) => t.id === st.id)?.label ?? null;
}
