import type {
  DiplomaCandidate,
  GameFlowCollection,
  GameState,
  PotegniBot,
  PotegniControllerData,
  PotegniHostData,
  PotegniIshod,
  PotegniMode,
  PotegniPhase,
  PotegniPotez,
  PotegniPredmet,
  PotegniStat,
  PotegniTezina,
  PotegniTim,
  Room,
} from '@igra/shared';
import {
  POTEGNI_BLOKADA_MS,
  POTEGNI_BOT_KORAK,
  POTEGNI_BOT_MS,
  POTEGNI_KAZNA_UDEO,
  POTEGNI_KORAK,
  POTEGNI_TIMOVI_SEKUNDI,
  clampPotegniBot,
  clampPotegniMode,
  clampPotegniPredmeti,
  clampPotegniTezina,
  clampPotegniTrajanje,
  formatPotegniBroj,
  parsePotegniBroj,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import { napraviZadatak, type GenZadatak } from './zadaci.js';

/** Odbrojavanje pre vuče (s). Admin može da ga promeni u „Timinzi". */
export const SPREMNI_DURATION = 4;
/** Koliko dugo se vidi pobednik pre platformske rang liste (s). */
export const KRAJ_DURATION = 12;
/** Poeni po tačnom odgovoru i bonus pobedničkom timu. */
const POENI_TACNO = 100;
const POENI_POBEDA = 500;
/** Koliko poslednjih poteza ide u traku na TV-u. */
const POTEZI_MAX = 8;

interface IgracStanje {
  tim: PotegniTim;
  zadatak: (GenZadatak & { id: number }) | null;
  /** Od kad teče vreme za tekući zadatak (posle blokade — od njenog kraja). */
  zadatakOd: number;
  blokDo: number;
  tacno: number;
  netacno: number;
  niz: number;
  /** ms do svakog tačnog odgovora. */
  vremena: number[];
  /** Koliko je jedinica pozicije poklonio protivniku promašajima. */
  poklonjeno: number;
  poeni: number;
  promasaj?: PotegniControllerData['promasaj'];
}

/**
 * Povuci-potegni — dva tima vuku konopac; svako rešava svoj zadatak.
 *
 * Čvor je jedan broj, `pozicija` od −100 (plava crta) do 100 (crvena crta).
 * Tačan odgovor pomera ga za POTEGNI_KORAK / (igrača u timu), pa tim od tri
 * vuče jače po odgovoru od tima od četiri i nejednaki timovi su fer. Netačan
 * daje protivniku pola tog koraka i blokira igrača 3 s. U solo modu svi su
 * crveni, a plavu stranu vuče bot u stalnom ritmu.
 *
 * Anti-leak: odgovor tekućeg zadatka ostaje na serveru; u `playerData` ide
 * samo tekst i ponude, a tačan odgovor tek u `promasaj`, posle promašaja.
 */
export class PovuciPotegniModule extends BaseGameModule {
  readonly gameId = 'povuci-potegni';

  private timings: Record<string, number> = {};
  private phase: PotegniPhase = 'timovi';
  private phaseTime = 0;
  private mode: PotegniMode = 'timovi';
  private predmeti: PotegniPredmet[] = [];
  private tezina: PotegniTezina = 'srednja';
  private trajanje = 180;
  private bot: PotegniBot = 'srednji';
  private pozicija = 0;
  private igraci = new Map<string, IgracStanje>();
  private potezi: PotegniPotez[] = [];
  private seq = 0;
  private botAcc = 0;
  private botPoteza = 0;
  private ishod: PotegniIshod | undefined;
  private statistika: PotegniStat[] | undefined;

  validateStart(room: Room, customContent?: unknown): string | null {
    const mode = clampPotegniMode((customContent as { potegniMode?: unknown } | undefined)?.potegniMode);
    const connected = room.players.filter((p) => p.isConnected).length;
    if (mode === 'timovi' && connected < 2) {
      return 'Za dva tima treba bar dvoje — izaberi „Solo protiv bota".';
    }
    if (connected > 12) return 'Povuci-potegni prima najviše 12 igrača.';
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const c = (customContent ?? {}) as Record<string, unknown>;
    this.mode = clampPotegniMode(c.potegniMode);
    this.predmeti = clampPotegniPredmeti(c.potegniPredmeti);
    this.tezina = clampPotegniTezina(c.potegniTezina);
    this.trajanje = clampPotegniTrajanje(c.potegniTrajanje);
    this.bot = clampPotegniBot(c.potegniBot);

    // Početni timovi: izmešano pa naizmenično, da su odmah izjednačeni.
    const ids = room.players.filter((p) => p.isConnected).map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    ids.forEach((id, i) => {
      this.igraci.set(id, {
        tim: this.mode === 'solo' || i % 2 === 0 ? 'crveni' : 'plavi',
        zadatak: null,
        zadatakOd: 0,
        blokDo: 0,
        tacno: 0,
        netacno: 0,
        niz: 0,
        vremena: [],
        poklonjeno: 0,
        poeni: 0,
      });
    });

    if (this.mode === 'solo') this.toSpremni();
    else {
      this.phase = 'timovi';
      this.phaseTime = POTEGNI_TIMOVI_SEKUNDI;
    }
    return this.build(room);
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    const igrac = this.igraci.get(playerId);
    if (!igrac) return null;

    if (action === 'potegni:tim') {
      if (this.phase !== 'timovi') return null;
      const tim = data.tim === 'plavi' ? 'plavi' : data.tim === 'crveni' ? 'crveni' : null;
      if (!tim || tim === igrac.tim) return null;
      igrac.tim = tim;
      return this.build(room);
    }

    if (action === 'potegni:odgovor') {
      if (this.phase !== 'vuca' || !igrac.zadatak) return null;
      // Odgovor na zadatak koji je već zamenjen (dupli tap, spora mreža).
      if (data.zadatakId !== igrac.zadatak.id) return null;
      const now = Date.now();
      if (now < igrac.blokDo) return null;
      const dato = typeof data.vrednost === 'string' ? data.vrednost.slice(0, 24) : '';
      if (!dato.trim()) return null;
      this.odgovor(room, playerId, igrac, dato, now);
      return this.build(room);
    }

    return null;
  }

  onHostAction(room: Room, _gameState: GameState, action: string): GameState | null {
    if (this.phase !== 'timovi') return null;
    if (action === 'potegni:pomiri') {
      this.pomiri(room);
      return this.build(room);
    }
    if (action === 'potegni:pocni') {
      this.toSpremni();
      return this.build(room);
    }
    return null;
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.phase === 'ended') return null;
    const sec = deltaMs / 1000;

    if (this.phase === 'vuca') {
      this.phaseTime -= sec;
      // Prošla blokada: promašaj više ne treba telefonu (ni povratku na vezu).
      const now = Date.now();
      for (const igrac of this.igraci.values()) {
        if (igrac.promasaj && igrac.blokDo <= now) igrac.promasaj = undefined;
      }
      if (this.mode === 'solo') {
        this.botAcc += deltaMs;
        const korak = POTEGNI_BOT_MS[this.bot];
        while (this.botAcc >= korak && this.phase === 'vuca') {
          this.botAcc -= korak;
          this.botPoteza += 1;
          this.pomeri(-POTEGNI_BOT_KORAK);
          this.dodajPotez({ playerId: 'bot', tim: 'plavi', ok: true, udeo: 1 });
          this.proveriCrtu(room);
        }
      }
      if (this.phase === 'vuca' && this.phaseTime <= 0) this.zavrsi(room, 'vreme');
      return this.build(room);
    }

    this.phaseTime -= sec;
    if (this.phaseTime > 0) return this.build(room);
    switch (this.phase) {
      case 'timovi':
        this.toSpremni();
        break;
      case 'spremni':
        this.toVuca();
        break;
      case 'kraj':
        this.phase = 'ended';
        this.phaseTime = 0;
        break;
    }
    return this.build(room);
  }

  onPlayerDisconnect(room: Room, _gameState: GameState, playerId: string): GameState | null {
    // Stiže tek kad istekne grejs: mesto u timu se oslobađa.
    if (!this.igraci.delete(playerId)) return null;
    return this.build(room);
  }

  onResume(pausedMs: number): void {
    for (const igrac of this.igraci.values()) {
      if (igrac.blokDo) igrac.blokDo += pausedMs;
      if (igrac.zadatakOd) igrac.zadatakOd += pausedMs;
    }
  }

  // --- Tok igre: preskoči ----------------------------------------------------

  getFlowInfo(): { collection: GameFlowCollection | null; skipLabel: string | null } {
    const skipLabel =
      this.phase === 'timovi'
        ? 'Počni igru'
        : this.phase === 'spremni'
          ? 'Odmah na konopac'
          : this.phase === 'vuca'
            ? 'Završi vuču'
            : this.phase === 'kraj'
              ? 'Na rezultate'
              : null;
    return { collection: null, skipLabel };
  }

  onHostSkip(room: Room, gameState: GameState): GameState | null {
    if (this.phase === 'ended') return null;
    if (this.phase === 'vuca') {
      this.zavrsi(room, 'vreme');
      return this.build(room);
    }
    this.phaseTime = 0;
    return this.onTick(room, gameState, 0);
  }

  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const out: DiplomaCandidate[] = [];
    const ziv = [...this.igraci.entries()].filter(([id]) => room.players.some((p) => p.id === id));
    if (ziv.length === 0) return out;

    const najvise = ziv.reduce((a, b) => (b[1].tacno > a[1].tacno ? b : a));
    if (najvise[1].tacno >= 5) {
      out.push({
        playerId: najvise[0],
        awardId: 'brzi-racun',
        priority: 66,
        subtitle: `${najvise[1].tacno} tačnih odgovora`,
      });
    }
    const cisti = ziv
      .filter(([id, s]) => s.netacno === 0 && s.tacno >= 5 && id !== najvise[0])
      .sort((a, b) => b[1].tacno - a[1].tacno)[0];
    if (cisti) {
      out.push({
        playerId: cisti[0],
        awardId: 'hladna-glava',
        priority: 62,
        subtitle: `${cisti[1].tacno} tačnih, nijedan promašaj`,
      });
    }
    const klizav = ziv.reduce((a, b) => (b[1].netacno > a[1].netacno ? b : a));
    if (klizav[1].netacno >= 4) {
      out.push({
        playerId: klizav[0],
        awardId: 'klizav-konopac',
        priority: 50,
        subtitle: `${klizav[1].netacno} promašaja`,
      });
    }
    return out;
  }

  // --- Pravila ---------------------------------------------------------------

  private toSpremni(): void {
    // Prazan tim bi značio igru bez protivnika — pre starta se timovi pomire.
    if (this.mode === 'timovi') {
      const crveni = [...this.igraci.values()].filter((i) => i.tim === 'crveni').length;
      if (crveni === 0 || crveni === this.igraci.size) this.pomiri();
    }
    this.phase = 'spremni';
    this.phaseTime = this.timings.SPREMNI_DURATION ?? SPREMNI_DURATION;
  }

  private toVuca(): void {
    this.phase = 'vuca';
    this.phaseTime = this.trajanje;
    const now = Date.now();
    for (const igrac of this.igraci.values()) this.noviZadatak(igrac, now);
  }

  /** Premešta igrače iz većeg tima u manji dok razlika ne bude najviše 1. */
  private pomiri(room?: Room): void {
    const connected = (id: string) => !room || room.players.some((p) => p.id === id && p.isConnected);
    for (let guard = 0; guard < 20; guard++) {
      const crveni = [...this.igraci.entries()].filter(([, i]) => i.tim === 'crveni');
      const plavi = [...this.igraci.entries()].filter(([, i]) => i.tim === 'plavi');
      if (Math.abs(crveni.length - plavi.length) <= 1) return;
      const veci = crveni.length > plavi.length ? crveni : plavi;
      // Prvo se seli neko ko nije tu — onaj ko je tu bar vidi svoju stranu.
      const kandidat = veci.find(([id]) => !connected(id)) ?? veci[veci.length - 1];
      kandidat[1].tim = kandidat[1].tim === 'crveni' ? 'plavi' : 'crveni';
    }
  }

  private noviZadatak(igrac: IgracStanje, od: number): void {
    const prethodni = igrac.zadatak ? igrac.zadatak.tekst + (igrac.zadatak.podtekst ?? '') : undefined;
    igrac.zadatak = { ...napraviZadatak(this.predmeti, this.tezina, prethodni), id: ++this.seq };
    igrac.zadatakOd = od;
  }

  private velicinaTima(room: Room, tim: PotegniTim): number {
    let n = 0;
    for (const [id, igrac] of this.igraci) {
      if (igrac.tim !== tim) continue;
      if (room.players.some((p) => p.id === id && p.isConnected)) n += 1;
    }
    return Math.max(1, n);
  }

  private odgovor(room: Room, playerId: string, igrac: IgracStanje, dato: string, now: number): void {
    const z = igrac.zadatak!;
    const ok =
      typeof z.odgovor === 'string'
        ? dato === z.odgovor
        : Math.abs(parsePotegniBroj(dato) - z.odgovor) < 1e-6 * Math.max(1, Math.abs(z.odgovor));
    const n = this.velicinaTima(room, igrac.tim);
    const smer = igrac.tim === 'crveni' ? 1 : -1;
    const korak = POTEGNI_KORAK / n;

    if (ok) {
      igrac.tacno += 1;
      igrac.niz += 1;
      igrac.vremena.push(Math.max(0, now - igrac.zadatakOd));
      igrac.poeni += POENI_TACNO;
      const player = room.players.find((p) => p.id === playerId);
      if (player) player.score += POENI_TACNO;
      this.pomeri(smer * korak);
      this.noviZadatak(igrac, now);
    } else {
      igrac.netacno += 1;
      igrac.niz = 0;
      igrac.blokDo = now + POTEGNI_BLOKADA_MS;
      const kazna = korak * POTEGNI_KAZNA_UDEO;
      igrac.poklonjeno += kazna;
      this.pomeri(-smer * kazna);
      igrac.promasaj = {
        id: ++this.seq,
        tekst: z.tekst,
        tacno:
          (typeof z.odgovor === 'string' ? z.odgovor : formatPotegniBroj(z.odgovor)) +
          (z.jedinica && typeof z.odgovor !== 'string' ? ` ${z.jedinica}` : ''),
        dato,
        ms: POTEGNI_BLOKADA_MS,
      };
      // Vreme za sledeći zadatak teče tek kad blokada prođe.
      this.noviZadatak(igrac, igrac.blokDo);
    }
    this.dodajPotez({ playerId, tim: igrac.tim, ok, udeo: n });
    this.proveriCrtu(room);
  }

  private pomeri(d: number): void {
    this.pozicija = Math.max(-100, Math.min(100, this.pozicija + d));
  }

  private dodajPotez(p: Omit<PotegniPotez, 'id'>): void {
    this.potezi.unshift({ ...p, id: ++this.seq });
    if (this.potezi.length > POTEZI_MAX) this.potezi.length = POTEZI_MAX;
  }

  private proveriCrtu(room: Room): void {
    if (this.phase !== 'vuca') return;
    if (Math.abs(this.pozicija) >= 100 - 1e-9) this.zavrsi(room, 'crta');
  }

  private zavrsi(room: Room, razlog: 'crta' | 'vreme'): void {
    const pobednik: PotegniTim | null =
      this.pozicija > 0.5 ? 'crveni' : this.pozicija < -0.5 ? 'plavi' : null;
    this.ishod = { pobednik, razlog, preostalo: Math.max(0, Math.ceil(this.phaseTime)) };

    if (pobednik) {
      for (const [id, igrac] of this.igraci) {
        if (igrac.tim !== pobednik) continue;
        igrac.poeni += POENI_POBEDA;
        const player = room.players.find((p) => p.id === id);
        if (player) player.score += POENI_POBEDA;
      }
    }

    const prosek = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
    const stats: PotegniStat[] = [...this.igraci.entries()].map(([playerId, s]) => ({
      playerId,
      tim: s.tim,
      tacno: s.tacno,
      netacno: s.netacno,
      prosekMs: Math.round(prosek(s.vremena)),
    }));
    for (const tim of ['crveni', 'plavi'] as const) {
      const kandidati = stats.filter((s) => s.tim === tim && s.tacno >= 3);
      const munja = kandidati.sort((a, b) => a.prosekMs - b.prosekMs)[0];
      if (munja) munja.oznaka = 'munja';
      for (const s of kandidati) {
        if (!s.oznaka && s.netacno === 0) s.oznaka = 'bez-greske';
      }
    }
    this.statistika = stats.sort((a, b) => b.tacno - a.tacno || a.netacno - b.netacno);

    for (const igrac of this.igraci.values()) igrac.blokDo = 0;
    this.phase = 'kraj';
    this.phaseTime = this.timings.KRAJ_DURATION ?? KRAJ_DURATION;
  }

  // --- Slanje stanja -----------------------------------------------------------

  private build(room: Room): GameState {
    const now = Date.now();
    const tacno = { crveni: 0, plavi: 0 };
    const netacno = { crveni: 0, plavi: 0 };
    for (const s of this.igraci.values()) {
      tacno[s.tim] += s.tacno;
      netacno[s.tim] += s.netacno;
    }
    if (this.mode === 'solo') tacno.plavi = this.botPoteza;

    const igraci = room.players
      .filter((p) => this.igraci.has(p.id))
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        avatarEmoji: p.avatarEmoji,
        tim: this.igraci.get(p.id)!.tim,
        connected: p.isConnected,
      }));

    const host: PotegniHostData = {
      mode: this.mode,
      predmeti: this.predmeti,
      tezina: this.tezina,
      trajanje: this.trajanje,
      pozicija: Math.round(this.pozicija * 100) / 100,
      igraci,
      tacno,
      netacno,
      potezi: this.potezi,
      blokirani: [...this.igraci.entries()].filter(([, s]) => s.blokDo > now).map(([id]) => id),
      kontrolaId: room.remoteHostPlayerId,
    };
    if (this.mode === 'solo') {
      host.bot = this.bot;
      host.botPoteza = this.botPoteza;
    }
    if (this.ishod) host.ishod = this.ishod;
    if (this.statistika) host.statistika = this.statistika;

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const [id, s] of this.igraci) {
      const pd: PotegniControllerData = {
        tim: s.tim,
        tacno: s.tacno,
        netacno: s.netacno,
        niz: s.niz,
        poeni: s.poeni,
      };
      if (this.phase === 'vuca' && s.zadatak) {
        // Bez odgovora — vidi zaglavlje modula.
        const { odgovor: _odgovor, ...javno } = s.zadatak;
        pd.zadatak = javno;
      }
      if (s.promasaj && this.phase === 'vuca') pd.promasaj = s.promasaj;
      playerData[id] = pd as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.phase,
      round: 1,
      totalRounds: 1,
      timeRemaining: Math.max(0, Math.ceil(this.phaseTime)),
      data: { phase: this.phase, host },
      playerData,
    };
  }
}
