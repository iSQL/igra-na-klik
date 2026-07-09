import type { Room, GameState } from '@igra/shared';
import {
  shuffled,
  clampGameRounds,
  buildBoljiZivotDeck,
  BZ_POWER_BY_VALUE,
  BZ_CALL_PENALTY,
  BZ_POPARA_V,
  BZ_RISKA_V,
  bzRoundSum,
} from '@igra/shared';
import type {
  BZCardInfo,
  BoljiZivotPowerKind,
  BoljiZivotPhase,
  BZRevealedCard,
  BZFamilyPublic,
  BZRevealFamily,
  BZLeaderboardEntry,
  BZReactionPublic,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';

// Aktivni ulazni tajmeri — gameplay balans, namerno NISU u /admin/timinzi.
const AWAIT_DRAW_DURATION = 30;
const HOLDING_DURATION = 25;
const POWER_SELECT_DURATION = 20;
const POWER_LOOK_DURATION = 15;
const REACTION_DURATION = 7;
const RISKA_DURATION = 20;
const SLAP_WINDOW_MS = 4000;

// Pauze — podesive kroz /admin/timinzi (GAME_TIMING_DEFS 'bolji-zivot').
const PEEKING_DURATION = 20;
const PEEK_SHOW_DURATION = 4;
const RACIJA_SHOW_DURATION = 7;
const REVEAL_DURATION = 15;
const FINAL_LEADERBOARD_DURATION = 10;

/**
 * Bezbednosni limit poteza po rundi — ako niko ne vikne "Bolji život!",
 * runda se prinudno otkriva umesto da traje večno.
 */
const MAX_TURNS_PER_PLAYER = 15;

interface BZSeat {
  playerId: string;
  // Stabilne pozicije: null = rupa (slap / Popara); kaznene karte se dodaju
  // na kraj. Pozicije se NIKAD ne premeštaju — poziciono pamćenje je igra.
  slots: (BZCardInfo | null)[];
  initialPeeksUsed: number;
  slapAttempted: boolean;
}

type PendingTargeted =
  | { kind: 'peek-other'; actorId: string; targetId: string; targetPos: number }
  | {
      kind: 'blind-swap';
      actorId: string;
      actorPos: number;
      targetId: string;
      targetPos: number;
    }
  | { kind: 'look-swap'; actorId: string; targetId: string; targetPos: number }
  | {
      kind: 'riska-swap';
      actorId: string;
      actorPos: number;
      targetId: string;
      targetPos: number;
    };

interface SlapCtx {
  value: number;
  deadlineMs: number;
  winnerId: string | null;
  winnerPos: number | null;
  failed: BZRevealedCard[];
}

export class BoljiZivotModule extends BaseGameModule {
  readonly gameId = 'bolji-zivot';

  private timings: Record<string, number> = {};

  private sub: BoljiZivotPhase = 'peeking';
  private timeLeft = 0;
  private roundNumber = 1;
  private totalRounds = 4;
  private turnOrder: string[] = [];
  private currentPlayerId: string | null = null;
  private seats = new Map<string, BZSeat>();
  private drawPile: BZCardInfo[] = [];
  private discard: BZCardInfo[] = [];
  private held: BZCardInfo | null = null;
  private heldFromDiscard = false;
  private calledBy: string | null = null;
  private finalQueue: string[] = [];
  private pendingPower: { v: number; kind: BoljiZivotPowerKind } | null = null;
  private lookCtx: { targetId: string; targetPos: number } | null = null;
  private pendingReaction: PendingTargeted | null = null;
  private slap: SlapCtx | null = null;
  private riskaHolder: string | null = null;
  private turnsTaken = 0;
  private lastAction: string | null = null;
  private lastActionId = 0;
  private changedSlots: { playerId: string; pos: number }[] = [];
  // Privatna viđenja, striktno vezana za tekuću pod-fazu — čiste se na
  // svakom kraju poteza / izlasku iz peeking-a i NE reemituju se kasnije.
  private visible = new Map<string, BZRevealedCard[]>();
  private racijaReveals: BZRevealedCard[] | null = null;
  private revealData: {
    families: BZRevealFamily[];
    callerId: string | null;
    callerName: string | null;
    callerSuccess: boolean | null;
    winnerIds: string[];
  } | null = null;
  private leaderboard: BZLeaderboardEntry[] | null = null;

  validateStart(room: Room): string | null {
    const connected = room.players.filter((p) => p.isConnected);
    if (connected.length > 6) {
      return 'Bolji život se igra sa najviše 6 igrača.';
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    this.totalRounds = clampGameRounds(
      this.gameId,
      (customContent as { roundCount?: unknown } | undefined)?.roundCount
    );
    this.roundNumber = 1;
    this.turnOrder = shuffled(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );
    this.startRound(room);
    return this.buildGameState(room);
  }

  // ---------------------------------------------------------------- runda

  private startRound(room: Room): void {
    const deck = shuffled(buildBoljiZivotDeck());
    this.seats.clear();
    for (const id of this.turnOrder) {
      this.seats.set(id, {
        playerId: id,
        slots: [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!],
        initialPeeksUsed: 0,
        slapAttempted: false,
      });
    }
    this.drawPile = deck;
    // Otvori prvu kartu otpada da "uzmi sa otpada" postoji od prvog poteza.
    this.discard = [this.drawPile.pop()!];
    this.held = null;
    this.heldFromDiscard = false;
    this.calledBy = null;
    this.finalQueue = [];
    this.pendingPower = null;
    this.lookCtx = null;
    this.pendingReaction = null;
    this.slap = null;
    this.riskaHolder = null;
    this.turnsTaken = 0;
    this.visible.clear();
    this.racijaReveals = null;
    this.revealData = null;
    this.currentPlayerId = null;
    this.sub = 'peeking';
    this.timeLeft = this.timings.PEEKING_DURATION ?? PEEKING_DURATION;
    this.announce(
      `Runda ${this.roundNumber}/${this.totalRounds} — svako gleda 2 svoje karte`
    );
    void room;
  }

  // -------------------------------------------------------------- pomoćne

  private announce(text: string): void {
    this.lastAction = text;
    this.lastActionId++;
    this.changedSlots = [];
  }

  private markChanged(playerId: string, pos: number): void {
    this.changedSlots.push({ playerId, pos });
  }

  private nameOf(room: Room, playerId: string | null): string {
    if (!playerId) return '???';
    return room.players.find((p) => p.id === playerId)?.name ?? '???';
  }

  private isConnected(room: Room, playerId: string): boolean {
    return room.players.find((p) => p.id === playerId)?.isConnected ?? false;
  }

  private cardLabel(card: BZCardInfo): string {
    return `${card.name} (${card.v})`;
  }

  /** Vuče sa špila; prazan špil → promešaj otpad bez vrha. null = nema karata. */
  private drawCard(): BZCardInfo | null {
    if (this.drawPile.length === 0) {
      if (this.discard.length > 1) {
        const top = this.discard.pop()!;
        this.drawPile = shuffled(this.discard);
        this.discard = [top];
        // Špil se promenio — stari slap prozor više nema smisla.
        this.slap = null;
      }
    }
    return this.drawPile.pop() ?? null;
  }

  private discardTopChanged(): void {
    // Vrh otpada se promenio (uzimanje/novo bacanje) — zatvori stari prozor.
    this.slap = null;
  }

  private pushToDiscard(card: BZCardInfo, openSlap: boolean): void {
    this.discardTopChanged();
    this.discard.push(card);
    if (openSlap && card.v <= 9) {
      this.slap = {
        value: card.v,
        deadlineMs: Date.now() + SLAP_WINDOW_MS,
        winnerId: null,
        winnerPos: null,
        failed: [],
      };
      for (const seat of this.seats.values()) seat.slapAttempted = false;
    }
  }

  private presentPositions(seat: BZSeat): number[] {
    return seat.slots
      .map((c, i) => (c ? i : -1))
      .filter((i) => i >= 0);
  }

  private addVisible(viewerId: string, reveal: BZRevealedCard): void {
    const list = this.visible.get(viewerId) ?? [];
    list.push(reveal);
    this.visible.set(viewerId, list);
  }

  private penaltyCard(room: Room, playerId: string): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;
    const card = this.drawCard();
    if (!card) return;
    seat.slots.push(card);
    this.markChanged(playerId, seat.slots.length - 1);
    void room;
  }

  // ------------------------------------------------------------- potezi

  private nextAfter(playerId: string | null): string | null {
    if (this.turnOrder.length === 0) return null;
    const start = playerId ? this.turnOrder.indexOf(playerId) : -1;
    return this.turnOrder[(start + 1 + this.turnOrder.length) % this.turnOrder.length];
  }

  private nextConnectedAfter(room: Room, playerId: string | null): string | null {
    if (this.turnOrder.length === 0) return null;
    const start = playerId ? this.turnOrder.indexOf(playerId) : -1;
    for (let step = 1; step <= this.turnOrder.length; step++) {
      const candidate =
        this.turnOrder[(start + step + this.turnOrder.length) % this.turnOrder.length];
      if (this.isConnected(room, candidate)) return candidate;
    }
    // Niko nije povezan — vrati sledećeg po redu; tajmer će odigrati potez,
    // a limit poteza / idle sweeper zatvaraju mrtvu sobu.
    return this.nextAfter(playerId);
  }

  private clearTurnScoped(): void {
    this.held = null;
    this.heldFromDiscard = false;
    this.pendingPower = null;
    this.lookCtx = null;
    this.pendingReaction = null;
    this.racijaReveals = null;
    this.visible.clear();
  }

  private beginTurn(room: Room): void {
    this.clearTurnScoped();

    if (this.calledBy) {
      // Završni krug: svako (osim pozivača) igra još tačno jedan potez.
      while (this.finalQueue.length > 0) {
        const next = this.finalQueue.shift()!;
        if (!this.seats.has(next)) continue;
        if (!this.isConnected(room, next)) continue; // preskočen — njegova šteta
        this.currentPlayerId = next;
        this.sub = 'await-draw';
        this.timeLeft = AWAIT_DRAW_DURATION;
        return;
      }
      this.riskaPhase(room);
      return;
    }

    this.turnsTaken++;
    if (this.turnsTaken > MAX_TURNS_PER_PLAYER * Math.max(1, this.turnOrder.length)) {
      this.announce('Špil je presušio — prinudno otkrivanje!');
      this.doReveal(room);
      return;
    }

    this.currentPlayerId = this.nextConnectedAfter(room, this.currentPlayerId);
    this.sub = 'await-draw';
    this.timeLeft = AWAIT_DRAW_DURATION;
  }

  private endTurn(room: Room): void {
    this.beginTurn(room);
  }

  // --------------------------------------------------------------- riska

  private riskaPhase(room: Room): void {
    this.clearTurnScoped();
    // Riska ne odlazi tiho: ako je u ne-pozivačevoj porodici, vlasnik dobija
    // jedan dodatni potez da je zameni ili uvali — pre otkrivanja.
    for (const id of this.turnOrder) {
      if (id === this.calledBy) continue;
      const seat = this.seats.get(id);
      if (!seat) continue;
      const pos = seat.slots.findIndex((c) => c?.v === BZ_RISKA_V);
      if (pos < 0) continue;
      if (!this.isConnected(room, id)) break;
      this.riskaHolder = id;
      this.currentPlayerId = id;
      this.sub = 'riska';
      this.timeLeft = RISKA_DURATION;
      this.announce(
        `RISKA SE OGLAŠAVA! ${this.nameOf(room, id)} ima jedan dodatni potez`
      );
      return;
    }
    this.doReveal(room);
  }

  private riskaPos(holderId: string): number {
    const seat = this.seats.get(holderId);
    if (!seat) return -1;
    return seat.slots.findIndex((c) => c?.v === BZ_RISKA_V);
  }

  // ------------------------------------------------------------ reaction

  private openReaction(room: Room, pending: PendingTargeted): void {
    this.pendingReaction = pending;
    this.sub = 'reaction';
    this.timeLeft = REACTION_DURATION;
    void room;
  }

  /** Ciljana akcija prolazi (nije poništena Poparom) — izvrši je. */
  private resolvePendingReaction(room: Room): void {
    const pending = this.pendingReaction;
    this.pendingReaction = null;
    if (!pending) {
      this.endTurn(room);
      return;
    }

    const targetSeat = this.seats.get(pending.targetId);
    const targetCard = targetSeat?.slots[pending.targetPos] ?? null;
    if (!targetSeat || !targetCard) {
      // Meta je nestala (slap / diskonekt) — akcija propada.
      if (pending.kind === 'riska-swap') this.doReveal(room);
      else this.endTurn(room);
      return;
    }

    switch (pending.kind) {
      case 'peek-other': {
        this.addVisible(pending.actorId, {
          playerId: pending.targetId,
          pos: pending.targetPos,
          v: targetCard.v,
          name: targetCard.name,
        });
        this.sub = 'peek-show';
        this.timeLeft = this.timings.PEEK_SHOW_DURATION ?? PEEK_SHOW_DURATION;
        return;
      }
      case 'blind-swap': {
        const actorSeat = this.seats.get(pending.actorId);
        const actorCard = actorSeat?.slots[pending.actorPos] ?? null;
        if (!actorSeat || !actorCard) {
          this.endTurn(room);
          return;
        }
        actorSeat.slots[pending.actorPos] = targetCard;
        targetSeat.slots[pending.targetPos] = actorCard;
        this.announce(
          `Slepa zamena: ${this.nameOf(room, pending.actorId)} (karta ${pending.actorPos + 1}) ⇄ ${this.nameOf(room, pending.targetId)} (karta ${pending.targetPos + 1})`
        );
        this.markChanged(pending.actorId, pending.actorPos);
        this.markChanged(pending.targetId, pending.targetPos);
        this.endTurn(room);
        return;
      }
      case 'look-swap': {
        this.addVisible(pending.actorId, {
          playerId: pending.targetId,
          pos: pending.targetPos,
          v: targetCard.v,
          name: targetCard.name,
        });
        this.lookCtx = { targetId: pending.targetId, targetPos: pending.targetPos };
        this.sub = 'power-look';
        this.timeLeft = POWER_LOOK_DURATION;
        return;
      }
      case 'riska-swap': {
        const holderSeat = this.seats.get(pending.actorId);
        const riskaCard = holderSeat?.slots[pending.actorPos] ?? null;
        if (!holderSeat || !riskaCard || riskaCard.v !== BZ_RISKA_V) {
          this.doReveal(room);
          return;
        }
        holderSeat.slots[pending.actorPos] = targetCard;
        targetSeat.slots[pending.targetPos] = riskaCard;
        this.announce(
          `Riska menja vlasnika! ${this.nameOf(room, pending.actorId)} je uvalio Risku igraču ${this.nameOf(room, pending.targetId)} (karta ${pending.targetPos + 1})`
        );
        this.markChanged(pending.actorId, pending.actorPos);
        this.markChanged(pending.targetId, pending.targetPos);
        this.doReveal(room);
        return;
      }
    }
  }

  // ------------------------------------------------------------- reveal

  private doReveal(room: Room): void {
    this.clearTurnScoped();
    this.slap = null;
    this.riskaHolder = null;
    this.currentPlayerId = null;

    const families: BZRevealFamily[] = [];
    const sums = new Map<string, number>();

    for (const id of this.turnOrder) {
      const seat = this.seats.get(id);
      if (!seat) continue;
      const presentCards = seat.slots
        .map((c, pos) => (c ? { pos, card: c } : null))
        .filter((x): x is { pos: number; card: BZCardInfo } => x !== null);
      const { sum, pairedIndices } = bzRoundSum(presentCards.map((x) => x.card));
      const pairedSet = new Set(pairedIndices);
      sums.set(id, sum);
      const player = room.players.find((p) => p.id === id);
      families.push({
        playerId: id,
        name: player?.name ?? '???',
        avatarColor: player?.avatarColor ?? '#888',
        cards: presentCards.map((x, i) => ({
          pos: x.pos,
          v: x.card.v,
          name: x.card.name,
          paired: pairedSet.has(i),
        })),
        roundSum: sum,
        scoreAdded: 0,
        totalScore: 0,
        isCaller: id === this.calledBy,
      });
    }

    const callerId = this.calledBy && sums.has(this.calledBy) ? this.calledBy : null;
    let callerSuccess: boolean | null = null;
    const winnerIds: string[] = [];

    if (callerId) {
      const callerSum = sums.get(callerId)!;
      const otherSums = [...sums.entries()]
        .filter(([id]) => id !== callerId)
        .map(([, s]) => s);
      callerSuccess =
        otherSums.length === 0 || otherSums.every((s) => callerSum < s);

      if (callerSuccess) {
        winnerIds.push(callerId);
      } else {
        const minOther = Math.min(...otherSums);
        for (const [id, s] of sums) {
          if (id !== callerId && s === minOther) winnerIds.push(id);
        }
      }
    }

    for (const fam of families) {
      let added = fam.roundSum;
      if (winnerIds.includes(fam.playerId)) added = 0;
      if (callerId && fam.playerId === callerId && callerSuccess === false) {
        added = fam.roundSum + BZ_CALL_PENALTY;
      }
      fam.scoreAdded = added;
      const player = room.players.find((p) => p.id === fam.playerId);
      if (player) {
        player.score += added;
        fam.totalScore = player.score;
      }
    }

    this.revealData = {
      families,
      callerId,
      callerName: callerId ? this.nameOf(room, callerId) : null,
      callerSuccess,
      winnerIds,
    };
    this.sub = 'reveal';
    this.timeLeft = this.timings.REVEAL_DURATION ?? REVEAL_DURATION;
    if (callerId) {
      this.announce(
        callerSuccess
          ? `${this.nameOf(room, callerId)} je pozvao BOLJI ŽIVOT i USPEO!`
          : `${this.nameOf(room, callerId)} je pozvao BOLJI ŽIVOT — i pao! +${BZ_CALL_PENALTY} kazne`
      );
    }
  }

  private buildLeaderboard(room: Room): void {
    this.leaderboard = room.players
      .filter((p) => this.turnOrder.includes(p.id) || p.score > 0)
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        score: p.score,
        rank: 0,
      }))
      // Manje oraha = bolje — rastuće sortiranje, rank 1 je najmanje.
      .sort((a, b) => a.score - b.score)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }

  // -------------------------------------------------------------- akcije

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    const seat = this.seats.get(playerId);
    if (!seat) return null;

    switch (action) {
      case 'bz:peek':
        if (!this.handlePeek(room, seat, data)) return null;
        break;
      case 'bz:slap':
        if (!this.handleSlap(room, seat, data)) return null;
        break;
      case 'bz:call':
        if (!this.handleCall(room, playerId)) return null;
        break;
      case 'bz:draw':
        if (!this.handleDraw(playerId)) return null;
        break;
      case 'bz:take':
        if (!this.handleTake(room, playerId)) return null;
        break;
      case 'bz:discard':
        if (!this.handleDiscard(room, playerId)) return null;
        break;
      case 'bz:swap':
        if (!this.handleSwap(room, playerId, data)) return null;
        break;
      case 'bz:power-select':
        if (!this.handlePowerSelect(room, playerId, data)) return null;
        break;
      case 'bz:power-swap':
        if (!this.handlePowerSwap(room, playerId, data)) return null;
        break;
      case 'bz:power-keep':
        if (!this.handlePowerKeep(room, playerId)) return null;
        break;
      case 'bz:done':
        if (this.sub !== 'peek-show' || playerId !== this.currentPlayerId)
          return null;
        this.endTurn(room);
        break;
      case 'bz:reaction':
        if (!this.handleReaction(room, playerId, data)) return null;
        break;
      case 'bz:reaction-pass':
        if (this.sub !== 'reaction' || this.pendingReaction?.targetId !== playerId)
          return null;
        this.resolvePendingReaction(room);
        break;
      case 'bz:riska-draw':
        if (!this.handleRiskaDraw(room, playerId)) return null;
        break;
      case 'bz:riska-swap':
        if (!this.handleRiskaSwap(room, playerId, data)) return null;
        break;
      case 'bz:riska-skip':
        if (this.sub !== 'riska' || playerId !== this.riskaHolder) return null;
        this.doReveal(room);
        break;
      default:
        return null;
    }

    return this.buildGameState(room);
  }

  private handlePeek(
    room: Room,
    seat: BZSeat,
    data: Record<string, unknown>
  ): boolean {
    if (this.sub !== 'peeking') return false;
    if (seat.initialPeeksUsed >= 2) return false;
    const pos = data.pos;
    if (typeof pos !== 'number') return false;
    const card = seat.slots[pos];
    if (!card) return false;
    const already = (this.visible.get(seat.playerId) ?? []).some(
      (r) => r.playerId === seat.playerId && r.pos === pos
    );
    if (already) return false;
    seat.initialPeeksUsed++;
    this.addVisible(seat.playerId, {
      playerId: seat.playerId,
      pos,
      v: card.v,
      name: card.name,
    });

    // Svi povezani igrači iskoristili peek-ove → kreni odmah.
    const allDone = this.turnOrder.every((id) => {
      if (!this.isConnected(room, id)) return true;
      return (this.seats.get(id)?.initialPeeksUsed ?? 2) >= 2;
    });
    if (allDone) {
      this.visible.clear();
      this.beginTurn(room);
    }
    return true;
  }

  private handleSlap(
    room: Room,
    seat: BZSeat,
    data: Record<string, unknown>
  ): boolean {
    // Slap je paralelan prozor — dozvoljen tokom bilo koje pod-faze poteza
    // dok tajmer prozora traje (ne tokom peeking/riska/reveal pauza).
    if (
      this.sub === 'peeking' ||
      this.sub === 'riska' ||
      this.sub === 'reveal' ||
      this.sub === 'final-leaderboard' ||
      this.sub === 'ended'
    ) {
      return false;
    }
    const slap = this.slap;
    if (!slap || slap.winnerId || Date.now() > slap.deadlineMs) return false;
    if (seat.slapAttempted) return false;
    const pos = data.pos;
    if (typeof pos !== 'number') return false;
    const card = seat.slots[pos];
    if (!card) return false;

    seat.slapAttempted = true;

    if (card.v === slap.value) {
      // Pogodak: karta odlazi na otpad, porodica se smanjuje.
      seat.slots[pos] = null;
      this.discard.push(card);
      slap.winnerId = seat.playerId;
      slap.winnerPos = pos;
      this.announce(
        `SLAP! ${this.nameOf(room, seat.playerId)} odbacuje ${this.cardLabel(card)} (karta ${pos + 1})`
      );
      this.markChanged(seat.playerId, pos);
      this.slap = null;
    } else {
      // Promašaj: javno otkrivanje + kaznena karta; prozor ostaje otvoren.
      slap.failed.push({
        playerId: seat.playerId,
        pos,
        v: card.v,
        name: card.name,
      });
      this.announce(
        `${this.nameOf(room, seat.playerId)} promašuje slap — to je ${this.cardLabel(card)}! Kaznena karta`
      );
      this.markChanged(seat.playerId, pos);
      this.penaltyCard(room, seat.playerId);
    }
    return true;
  }

  private handleCall(room: Room, playerId: string): boolean {
    if (this.sub !== 'await-draw') return false;
    if (playerId !== this.currentPlayerId) return false;
    if (this.calledBy) return false;
    this.calledBy = playerId;
    // Završni krug: svi posle pozivača u redosledu, tačno po jedan potez.
    const idx = this.turnOrder.indexOf(playerId);
    this.finalQueue = [];
    for (let step = 1; step < this.turnOrder.length; step++) {
      this.finalQueue.push(this.turnOrder[(idx + step) % this.turnOrder.length]);
    }
    this.announce(`${this.nameOf(room, playerId)} viče: BOLJI ŽIVOT!`);
    this.beginTurn(room);
    return true;
  }

  private handleDraw(playerId: string): boolean {
    if (this.sub !== 'await-draw') return false;
    if (playerId !== this.currentPlayerId) return false;
    const card = this.drawCard();
    if (!card) return false;
    this.held = card;
    this.heldFromDiscard = false;
    this.sub = 'holding';
    this.timeLeft = HOLDING_DURATION;
    return true;
  }

  private handleTake(room: Room, playerId: string): boolean {
    if (this.sub !== 'await-draw') return false;
    if (playerId !== this.currentPlayerId) return false;
    if (this.discard.length === 0) return false;
    this.discardTopChanged();
    const card = this.discard.pop()!;
    this.held = card;
    this.heldFromDiscard = true;
    this.sub = 'holding';
    this.timeLeft = HOLDING_DURATION;
    this.announce(
      `${this.nameOf(room, playerId)} uzima ${this.cardLabel(card)} sa otpada`
    );
    return true;
  }

  private handleDiscard(room: Room, playerId: string): boolean {
    if (this.sub !== 'holding') return false;
    if (playerId !== this.currentPlayerId) return false;
    if (!this.held || this.heldFromDiscard) return false;
    const card = this.held;
    this.held = null;
    this.pushToDiscard(card, true);

    const power = BZ_POWER_BY_VALUE[card.v];
    if (!power) {
      this.announce(`${this.nameOf(room, playerId)} baca ${this.cardLabel(card)}`);
      this.endTurn(room);
      return true;
    }

    // Moć se aktivira SAMO ovde: karta izvučena sa špila i direktno bačena.
    if (power === 'raid') {
      const reveals: BZRevealedCard[] = [];
      for (const id of this.turnOrder) {
        const s = this.seats.get(id);
        if (!s) continue;
        const positions = this.presentPositions(s);
        if (positions.length === 0) continue;
        const pos = positions[Math.floor(Math.random() * positions.length)];
        const c = s.slots[pos]!;
        reveals.push({ playerId: id, pos, v: c.v, name: c.name });
      }
      this.racijaReveals = reveals;
      this.pendingPower = { v: card.v, kind: power };
      this.sub = 'racija-show';
      this.timeLeft = this.timings.RACIJA_SHOW_DURATION ?? RACIJA_SHOW_DURATION;
      this.announce(
        `${this.nameOf(room, playerId)} baca ${this.cardLabel(card)} — RACIJA! Svakome se otkriva po jedna karta`
      );
      return true;
    }

    // Da li moć uopšte ima validnu metu?
    const mySeat = this.seats.get(playerId)!;
    const othersWithCards = this.turnOrder.some(
      (id) =>
        id !== playerId &&
        this.presentPositions(this.seats.get(id)!).length > 0
    );
    const canUse =
      power === 'peek-own'
        ? this.presentPositions(mySeat).length > 0
        : power === 'blind-swap'
          ? this.presentPositions(mySeat).length > 0 && othersWithCards
          : othersWithCards;

    this.announce(
      `${this.nameOf(room, playerId)} baca ${this.cardLabel(card)} — ${canUse ? 'bira metu' : 'moć propada (nema mete)'}`
    );

    if (!canUse) {
      this.endTurn(room);
      return true;
    }

    this.pendingPower = { v: card.v, kind: power };
    this.sub = 'power-select';
    this.timeLeft = POWER_SELECT_DURATION;
    return true;
  }

  private handleSwap(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): boolean {
    if (this.sub !== 'holding') return false;
    if (playerId !== this.currentPlayerId) return false;
    if (!this.held) return false;
    const pos = data.pos;
    if (typeof pos !== 'number') return false;
    const seat = this.seats.get(playerId)!;
    const ejected = seat.slots[pos];
    if (!ejected) return false;
    seat.slots[pos] = this.held;
    this.held = null;
    this.heldFromDiscard = false;
    this.pushToDiscard(ejected, true);
    this.announce(
      `${this.nameOf(room, playerId)} menja kartu ${pos + 1} — izbacuje ${this.cardLabel(ejected)}`
    );
    this.markChanged(playerId, pos);
    // Zamena NIKAD ne aktivira moć izbačene karte.
    this.endTurn(room);
    return true;
  }

  private handlePowerSelect(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): boolean {
    if (this.sub !== 'power-select') return false;
    if (playerId !== this.currentPlayerId) return false;
    const power = this.pendingPower;
    if (!power) return false;

    if (power.kind === 'peek-own') {
      const pos = data.pos;
      if (typeof pos !== 'number') return false;
      const seat = this.seats.get(playerId)!;
      const card = seat.slots[pos];
      if (!card) return false;
      this.addVisible(playerId, {
        playerId,
        pos,
        v: card.v,
        name: card.name,
      });
      this.announce(`${this.nameOf(room, playerId)} gleda svoju kartu ${pos + 1}`);
      this.sub = 'peek-show';
      this.timeLeft = this.timings.PEEK_SHOW_DURATION ?? PEEK_SHOW_DURATION;
      return true;
    }

    const targetId = data.playerId;
    const targetPos = data.pos;
    if (typeof targetId !== 'string' || typeof targetPos !== 'number') return false;
    if (targetId === playerId) return false;
    const targetSeat = this.seats.get(targetId);
    if (!targetSeat || !targetSeat.slots[targetPos]) return false;

    if (power.kind === 'peek-other') {
      this.announce(
        `${this.nameOf(room, playerId)} špijunira kartu ${targetPos + 1} igrača ${this.nameOf(room, targetId)}`
      );
      this.openReaction(room, {
        kind: 'peek-other',
        actorId: playerId,
        targetId,
        targetPos,
      });
      return true;
    }

    if (power.kind === 'look-swap') {
      this.announce(
        `${this.nameOf(room, playerId)} gleda kartu ${targetPos + 1} igrača ${this.nameOf(room, targetId)} — možda je i menja!`
      );
      this.openReaction(room, {
        kind: 'look-swap',
        actorId: playerId,
        targetId,
        targetPos,
      });
      return true;
    }

    if (power.kind === 'blind-swap') {
      const ownPos = data.ownPos;
      if (typeof ownPos !== 'number') return false;
      const mySeat = this.seats.get(playerId)!;
      if (!mySeat.slots[ownPos]) return false;
      this.announce(
        `${this.nameOf(room, playerId)} pokušava slepu zamenu: svoja karta ${ownPos + 1} ⇄ ${this.nameOf(room, targetId)} karta ${targetPos + 1}`
      );
      this.openReaction(room, {
        kind: 'blind-swap',
        actorId: playerId,
        actorPos: ownPos,
        targetId,
        targetPos,
      });
      return true;
    }

    return false;
  }

  private handlePowerSwap(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): boolean {
    if (this.sub !== 'power-look') return false;
    if (playerId !== this.currentPlayerId) return false;
    const ctx = this.lookCtx;
    if (!ctx) return false;
    const ownPos = data.ownPos;
    if (typeof ownPos !== 'number') return false;
    const mySeat = this.seats.get(playerId)!;
    const myCard = mySeat.slots[ownPos];
    const targetSeat = this.seats.get(ctx.targetId);
    const targetCard = targetSeat?.slots[ctx.targetPos] ?? null;
    if (!myCard || !targetSeat || !targetCard) return false;
    mySeat.slots[ownPos] = targetCard;
    targetSeat.slots[ctx.targetPos] = myCard;
    this.announce(
      `${this.nameOf(room, playerId)} MENJA: svoja karta ${ownPos + 1} ⇄ ${this.nameOf(room, ctx.targetId)} karta ${ctx.targetPos + 1}`
    );
    this.markChanged(playerId, ownPos);
    this.markChanged(ctx.targetId, ctx.targetPos);
    this.endTurn(room);
    return true;
  }

  private handlePowerKeep(room: Room, playerId: string): boolean {
    if (this.sub !== 'power-look') return false;
    if (playerId !== this.currentPlayerId) return false;
    this.announce(`${this.nameOf(room, playerId)} je pogledao — i ostavlja kartu`);
    this.endTurn(room);
    return true;
  }

  private handleReaction(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): boolean {
    if (this.sub !== 'reaction') return false;
    const pending = this.pendingReaction;
    if (!pending || pending.targetId !== playerId) return false;
    const pos = data.pos;
    if (typeof pos !== 'number') return false;
    const seat = this.seats.get(playerId)!;
    const card = seat.slots[pos];
    if (!card) return false;

    if (card.v === BZ_POPARA_V) {
      // "Gospođice Lela, pišite odbijenicu!" — akcija poništena, Popara na otpad.
      seat.slots[pos] = null;
      this.pushToDiscard(card, false);
      this.announce(
        `POPARA! ${this.nameOf(room, playerId)}: "Ne može — pišite odbijenicu!" Akcija poništena`
      );
      this.markChanged(playerId, pos);
      const wasRiska = pending.kind === 'riska-swap';
      this.pendingReaction = null;
      if (wasRiska) this.doReveal(room);
      else this.endTurn(room);
      return true;
    }

    // Promašaj: javno otkrivanje + kaznena karta, pa akcija ipak prolazi.
    this.announce(
      `${this.nameOf(room, playerId)} pokušava odbijenicu — ali to je ${this.cardLabel(card)}! Kaznena karta`
    );
    this.markChanged(playerId, pos);
    this.penaltyCard(room, playerId);
    this.resolvePendingReaction(room);
    return true;
  }

  private handleRiskaDraw(room: Room, playerId: string): boolean {
    if (this.sub !== 'riska') return false;
    if (playerId !== this.riskaHolder) return false;
    const pos = this.riskaPos(playerId);
    if (pos < 0) return false;
    const drawn = this.drawCard();
    if (!drawn) return false;
    const seat = this.seats.get(playerId)!;
    const riska = seat.slots[pos]!;
    seat.slots[pos] = drawn;
    this.pushToDiscard(riska, false);
    this.announce(
      `${this.nameOf(room, playerId)} vuče kartu i šalje Risku na otpad!`
    );
    this.markChanged(playerId, pos);
    this.doReveal(room);
    return true;
  }

  private handleRiskaSwap(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): boolean {
    if (this.sub !== 'riska') return false;
    if (playerId !== this.riskaHolder) return false;
    const holderPos = this.riskaPos(playerId);
    if (holderPos < 0) return false;
    const targetId = data.playerId;
    const targetPos = data.pos;
    if (typeof targetId !== 'string' || typeof targetPos !== 'number') return false;
    if (targetId === playerId) return false;
    const targetSeat = this.seats.get(targetId);
    if (!targetSeat || !targetSeat.slots[targetPos]) return false;
    this.announce(
      `${this.nameOf(room, playerId)} pokušava da uvali Risku igraču ${this.nameOf(room, targetId)} (karta ${targetPos + 1})`
    );
    this.openReaction(room, {
      kind: 'riska-swap',
      actorId: playerId,
      actorPos: holderPos,
      targetId,
      targetPos,
    });
    return true;
  }

  // ---------------------------------------------------------------- tick

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    // Paralelni slap prozor ima svoj rok nezavisan od pod-faze.
    if (this.slap && Date.now() > this.slap.deadlineMs) {
      this.slap = null;
    }

    this.timeLeft -= deltaMs / 1000;
    if (this.timeLeft <= 0) {
      this.advanceOnTimeout(room);
    }
    return this.buildGameState(room);
  }

  private advanceOnTimeout(room: Room): void {
    switch (this.sub) {
      case 'peeking':
        // Ko nije virnuo — njegova šteta; runda kreće.
        this.visible.clear();
        this.beginTurn(room);
        break;

      case 'await-draw': {
        // AFK: automatski vuci i baci — bez moći (moć traži izbor mete).
        const card = this.drawCard();
        if (card) {
          this.pushToDiscard(card, true);
          this.announce(
            `${this.nameOf(room, this.currentPlayerId)} okleva — automatski baca ${this.cardLabel(card)}`
          );
        }
        this.endTurn(room);
        break;
      }

      case 'holding': {
        const card = this.held;
        this.held = null;
        if (card) {
          if (this.heldFromDiscard) {
            // Mora u porodicu: nasumično mesto.
            const seat = this.seats.get(this.currentPlayerId ?? '');
            const positions = seat ? this.presentPositions(seat) : [];
            if (seat && positions.length > 0) {
              const pos = positions[Math.floor(Math.random() * positions.length)];
              const ejected = seat.slots[pos]!;
              seat.slots[pos] = card;
              this.pushToDiscard(ejected, true);
              this.announce(
                `${this.nameOf(room, this.currentPlayerId)} okleva — karta ulazi na mesto ${pos + 1}, izbačen ${this.cardLabel(ejected)}`
              );
              this.markChanged(this.currentPlayerId!, pos);
            } else {
              this.pushToDiscard(card, false);
            }
          } else {
            this.pushToDiscard(card, true);
            this.announce(
              `${this.nameOf(room, this.currentPlayerId)} okleva — automatski baca ${this.cardLabel(card)}`
            );
          }
        }
        this.heldFromDiscard = false;
        this.endTurn(room);
        break;
      }

      case 'power-select':
        this.announce('Moć propada — vreme je isteklo');
        this.endTurn(room);
        break;

      case 'power-look':
        this.announce(
          `${this.nameOf(room, this.currentPlayerId)} je pogledao — i ostavlja kartu`
        );
        this.endTurn(room);
        break;

      case 'peek-show':
      case 'racija-show':
        this.endTurn(room);
        break;

      case 'reaction':
        this.resolvePendingReaction(room);
        break;

      case 'riska':
        this.announce('Riska ostaje gde je...');
        this.doReveal(room);
        break;

      case 'reveal':
        if (this.roundNumber < this.totalRounds) {
          this.roundNumber++;
          this.startRound(room);
        } else {
          this.buildLeaderboard(room);
          this.sub = 'final-leaderboard';
          this.timeLeft =
            this.timings.FINAL_LEADERBOARD_DURATION ?? FINAL_LEADERBOARD_DURATION;
        }
        break;

      case 'final-leaderboard':
        this.sub = 'ended';
        this.timeLeft = 0;
        break;

      case 'ended':
        break;
    }
  }

  // ----------------------------------------------------------- disconnect

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    const seat = this.seats.get(playerId);
    if (!seat) return null;

    // Karte odlaze na DNO špila neotkrivene — ne cure informacije.
    for (const card of seat.slots) {
      if (card) this.drawPile.unshift(card);
    }
    this.seats.delete(playerId);
    this.turnOrder = this.turnOrder.filter((id) => id !== playerId);
    this.finalQueue = this.finalQueue.filter((id) => id !== playerId);
    this.visible.delete(playerId);
    this.announce(
      `${this.nameOf(room, playerId)} napušta sto — karte se vraćaju u špil`
    );

    if (this.turnOrder.length < 2 && this.sub !== 'ended') {
      // Igra bez protivnika nema smisla.
      this.sub = 'ended';
      this.timeLeft = 0;
      return this.buildGameState(room);
    }

    if (this.sub === 'riska' && this.riskaHolder === playerId) {
      this.doReveal(room);
      return this.buildGameState(room);
    }

    if (this.sub === 'reaction' && this.pendingReaction) {
      const p = this.pendingReaction;
      if (p.targetId === playerId || p.actorId === playerId) {
        this.pendingReaction = null;
        if (p.kind === 'riska-swap') this.doReveal(room);
        else if (p.actorId === playerId) this.endTurn(room);
        else this.endTurn(room);
        return this.buildGameState(room);
      }
    }

    if (this.currentPlayerId === playerId) {
      // Njegov potez u bilo kojoj pod-fazi — karta iz ruke ide na dno špila
      // (bez otkrivanja), potez se predaje dalje.
      if (this.held) {
        this.drawPile.unshift(this.held);
        this.held = null;
      }
      if (this.sub !== 'reveal' && this.sub !== 'final-leaderboard') {
        this.endTurn(room);
      }
    }

    return this.buildGameState(room);
  }

  onEnd(): void {}

  // -------------------------------------------------------------- state

  private buildGameState(room: Room): GameState {
    const families: BZFamilyPublic[] = [];
    for (const id of this.turnOrder) {
      const seat = this.seats.get(id);
      if (!seat) continue;
      const player = room.players.find((p) => p.id === id);
      families.push({
        playerId: id,
        name: player?.name ?? '???',
        avatarColor: player?.avatarColor ?? '#888',
        avatarEmoji: player?.avatarEmoji,
        connected: player?.isConnected ?? false,
        slots: seat.slots.map((c, pos) => ({ pos, present: c !== null })),
        isCaller: id === this.calledBy,
      });
    }

    const discardTop =
      this.discard.length > 0 ? this.discard[this.discard.length - 1] : null;

    let reaction: BZReactionPublic | null = null;
    if (this.sub === 'reaction' && this.pendingReaction) {
      const p = this.pendingReaction;
      reaction = {
        targetPlayerId: p.targetId,
        targetName: this.nameOf(room, p.targetId),
        actorId: p.actorId,
        actorName: this.nameOf(room, p.actorId),
        kind: p.kind,
        targetPos: p.targetPos,
        actorPos: 'actorPos' in p ? p.actorPos : undefined,
      };
    }

    const slap = this.slap
      ? {
          value: this.slap.value,
          secondsLeft: Math.max(
            0,
            Math.ceil((this.slap.deadlineMs - Date.now()) / 1000)
          ),
          winnerId: this.slap.winnerId,
          winnerName: this.slap.winnerId
            ? this.nameOf(room, this.slap.winnerId)
            : null,
          failed: this.slap.failed,
        }
      : null;

    const power =
      (this.sub === 'power-select' || this.sub === 'power-look') && this.pendingPower
        ? {
            actorId: this.currentPlayerId ?? '',
            actorName: this.nameOf(room, this.currentPlayerId),
            kind: this.pendingPower.kind,
            v: this.pendingPower.v,
          }
        : null;

    const data: Record<string, unknown> = {
      sub: this.sub,
      roundNumber: this.roundNumber,
      totalRounds: this.totalRounds,
      turnOrder: this.turnOrder,
      currentPlayerId: this.currentPlayerId,
      currentPlayerName: this.currentPlayerId
        ? this.nameOf(room, this.currentPlayerId)
        : null,
      families,
      drawCount: this.drawPile.length,
      discardCount: this.discard.length,
      discardTop,
      calledBy: this.calledBy,
      callerName: this.calledBy ? this.nameOf(room, this.calledBy) : null,
      lastAction: this.lastAction,
      lastActionId: this.lastActionId,
      changedSlots: this.changedSlots,
      power,
      slap,
      reaction,
      racija:
        this.sub === 'racija-show' && this.racijaReveals
          ? { reveals: this.racijaReveals }
          : null,
      riska:
        this.sub === 'riska' && this.riskaHolder
          ? {
              holderId: this.riskaHolder,
              holderName: this.nameOf(room, this.riskaHolder),
            }
          : null,
      reveal: this.sub === 'reveal' ? this.revealData : null,
      leaderboard:
        this.sub === 'final-leaderboard' || this.sub === 'ended'
          ? this.leaderboard
          : null,
    };

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const seat = this.seats.get(player.id);
      if (!seat) {
        playerData[player.id] = {};
        continue;
      }
      const isMyTurn = player.id === this.currentPlayerId;
      playerData[player.id] = {
        mySlots: seat.slots.map((c, pos) => ({ pos, present: c !== null })),
        visible: this.visible.get(player.id) ?? [],
        peeksLeft:
          this.sub === 'peeking' ? 2 - seat.initialPeeksUsed : undefined,
        held: isMyTurn && this.sub === 'holding' ? this.held : null,
        heldFromDiscard: isMyTurn ? this.heldFromDiscard : false,
        isMyTurn,
        canSlap:
          this.slap !== null &&
          !seat.slapAttempted &&
          this.presentPositions(seat).length > 0,
        amTargeted:
          this.sub === 'reaction' &&
          this.pendingReaction?.targetId === player.id,
        amRiskaHolder: this.sub === 'riska' && this.riskaHolder === player.id,
        myScore: player.score,
      };
    }

    return {
      gameId: this.gameId,
      phase: this.sub,
      round: this.roundNumber,
      totalRounds: this.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.timeLeft)),
      data,
      playerData,
    };
  }
}
