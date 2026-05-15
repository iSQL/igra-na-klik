import type { Room, GameState } from '@igra/shared';
import { generateDobbleDeck, dealRound, findMatch } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type { SpotItInternalState, SpotItRoundState } from './SpotItState.js';

const CARD_REVEAL_DURATION = 2;
const RACING_DURATION = 30;
const ROUND_RESULTS_DURATION = 4;
const LEADERBOARD_DURATION = 8;
const LOCKOUT_MS = 5000;
const NUM_ROUNDS = 10;

export class SpotItModule extends BaseGameModule {
  readonly gameId = 'spot-it';

  private state!: SpotItInternalState;

  onStart(room: Room): GameState {
    const deck = generateDobbleDeck();
    this.state = {
      deck,
      phase: 'card-reveal',
      phaseTimeRemaining: CARD_REVEAL_DURATION,
      currentRound: 1,
      totalRounds: NUM_ROUNDS,
      round: this.dealNewRound(room, deck),
    };
    return this.buildGameState(room);
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (action !== 'spot-it:tap') return null;
    if (this.state.phase !== 'racing') return null;
    if (this.state.round.winnerId) return null;

    const lockedUntil = this.state.round.lockedUntil.get(playerId) ?? 0;
    if (Date.now() < lockedUntil) return null;

    const hand = this.state.round.playerHands.get(playerId);
    if (!hand) return null;

    const tappedIndex = data.symbolIndex;
    if (typeof tappedIndex !== 'number') return null;

    this.state.round.tappedPlayerIds.add(playerId);

    const matchSymbol = findMatch(hand, this.state.round.centerCard);
    if (tappedIndex !== matchSymbol) {
      this.state.round.lockedUntil.set(playerId, Date.now() + LOCKOUT_MS);
      return this.buildGameState(room);
    }

    const elapsedMs = Date.now() - this.state.round.raceStartTime;
    const timeRemainingMs = Math.max(0, RACING_DURATION * 1000 - elapsedMs);
    const score = Math.round(1000 * (timeRemainingMs / (RACING_DURATION * 1000)));

    this.state.round.winnerId = playerId;
    this.state.round.pointsAwarded[playerId] = score;

    const player = room.players.find((p) => p.id === playerId);
    if (player) player.score += score;

    this.transitionToResults();
    return this.buildGameState(room);
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
    }
    return this.buildGameState(room);
  }

  onEnd(): void {}

  private dealNewRound(room: Room, deck: number[][]): SpotItRoundState {
    // Deal to every player in the room (including mid-grace disconnects)
    // so a reconnect during the round still finds their card. removePlayer
    // (past grace) prunes them from room.players before the next deal.
    const playerIds = room.players.map((p) => p.id);
    const { center, hands } = dealRound(deck, playerIds);
    return {
      centerCard: center,
      playerHands: new Map(Object.entries(hands)),
      raceStartTime: 0,
      winnerId: null,
      lockedUntil: new Map(),
      tappedPlayerIds: new Set(),
      pointsAwarded: {},
    };
  }

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'card-reveal':
        this.state.phase = 'racing';
        this.state.phaseTimeRemaining = RACING_DURATION;
        this.state.round.raceStartTime = Date.now();
        break;

      case 'racing':
        this.transitionToResults();
        break;

      case 'round-results':
        if (this.state.currentRound < this.state.totalRounds) {
          this.state.currentRound++;
          this.state.round = this.dealNewRound(room, this.state.deck);
          this.state.phase = 'card-reveal';
          this.state.phaseTimeRemaining = CARD_REVEAL_DURATION;
        } else {
          this.state.phase = 'final-leaderboard';
          this.state.phaseTimeRemaining = LEADERBOARD_DURATION;
        }
        break;

      case 'final-leaderboard':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        break;
    }
  }

  private transitionToResults(): void {
    this.state.phase = 'round-results';
    this.state.phaseTimeRemaining = ROUND_RESULTS_DURATION;
  }

  private buildGameState(room: Room): GameState {
    const data: Record<string, unknown> = {
      phase: this.state.phase,
      roundNumber: this.state.currentRound,
      totalRounds: this.state.totalRounds,
    };

    const playerData: Record<string, Record<string, unknown>> = {};

    const phase = this.state.phase;

    if (phase === 'card-reveal' || phase === 'racing' || phase === 'round-results') {
      data.centerCard = this.state.round.centerCard;
    }

    if (phase === 'racing' || phase === 'round-results') {
      for (const player of room.players) {
        const hand = this.state.round.playerHands.get(player.id);
        if (!hand) continue;
        const locked = this.state.round.lockedUntil.get(player.id) ?? 0;
        playerData[player.id] = {
          personalCard: hand,
          lockedUntil: phase === 'racing' ? locked : 0,
          iWonRound: this.state.round.winnerId === player.id,
          iTapped: this.state.round.tappedPlayerIds.has(player.id),
        };
      }
    }

    if (phase === 'racing') {
      data.tappedCount = this.state.round.tappedPlayerIds.size;
      data.totalPlayers = room.players.filter((p) => p.isConnected).length;
    }

    if (phase === 'round-results') {
      const winnerId = this.state.round.winnerId;
      const winner = winnerId
        ? room.players.find((p) => p.id === winnerId) ?? null
        : null;
      let matchSymbolIndex: number | null = null;
      if (winnerId) {
        const winnerHand = this.state.round.playerHands.get(winnerId);
        if (winnerHand) {
          matchSymbolIndex = findMatch(winnerHand, this.state.round.centerCard);
        }
      }
      data.roundResult = {
        winnerId,
        winnerName: winner?.name ?? null,
        winnerAvatarColor: winner?.avatarColor ?? null,
        matchSymbolIndex,
        pointsAwarded: this.state.round.pointsAwarded,
      };
    }

    if (phase === 'final-leaderboard' || phase === 'ended') {
      data.leaderboard = room.players
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          score: p.score,
          rank: 0,
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }
}
