import type { BitkaHostData, BitkaPoint } from '@igra/shared';

/**
 * Prevođenje stanja igre u spisak vizuelnih događaja.
 *
 * Ovo je namerno **čista funkcija bez three.js-a** i bez ijednog novog socket
 * eventa: sve što TV animira već stoji u `BitkaHostData` (ishod duela, vlasnik
 * teritorije, pobednik). Sloj postoji da bi se ispod njega kasnije mogao
 * podmetnuti pravi 3D teren — scena se menja, ovaj ulaz ostaje isti.
 *
 * Okidanje ide isključivo na **razliku dva uzastopna stanja**, pa se svaki
 * događaj odigra tačno jednom. Ponovljeno stanje (reconnect, replay faze) ne
 * proizvodi ništa, jer razlike nema.
 */

export type BitkaFxKind =
  | 'napad'        // projektil od napadača ka meti
  | 'osvojeno'     // teritorija promenila vlasnika
  | 'odbranjeno'   // napad odbijen
  | 'zid'          // zamak izgubio zid
  | 'zamak-pao'    // zamak srušen, igrač ispao
  | 'pobeda';      // kraj bitke

export interface BitkaFxEvent {
  /** Raste monotono — scena po njemu zna šta je već odigrala. */
  id: number;
  kind: BitkaFxKind;
  /** Meta efekta u normalizovanim koordinatama [0,1] nad slikom mape. */
  at: BitkaPoint;
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
      out.push({ id: nextId(), kind: 'napad', at, from, color: attacker });
      if (duel.outcome === 'branilac') {
        out.push({ id: nextId(), kind: 'odbranjeno', at, from, color: colorOf(duel.defenderId) });
      } else if (duel.outcome === 'zid') {
        out.push({ id: nextId(), kind: 'zid', at, from, color: attacker });
      } else if (duel.outcome === 'zamak-pao') {
        out.push({ id: nextId(), kind: 'zamak-pao', at, from, color: attacker });
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
    if (at) out.push({ id: nextId(), kind: 'osvojeno', at, color: colorOf(now) });
  }

  // 3) Kraj bitke.
  if (!prev.host.winnerId && next.host.winnerId) {
    const at = castleOf(next.host, next.host.winnerId) ?? labelOf(next.host.board[0]?.id);
    if (at) out.push({ id: nextId(), kind: 'pobeda', at, color: colorOf(next.host.winnerId) });
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
