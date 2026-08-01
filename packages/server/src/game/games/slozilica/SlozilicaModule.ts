import type {
  DiplomaCandidate,
  GameState,
  Room,
  SlozilicaControllerData,
  SlozilicaHostData,
  SlozilicaPlayerResult,
  SlozilicaRejection,
} from '@igra/shared';
import {
  clampGameRounds,
  clampLetterCount,
  generateLetters,
  isPlausibleWord,
  normalizeWord,
  scoreWord,
  SLOZILICA_MIN_WORD,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import {
  canBuildFrom,
  findBestWords,
  isWord,
  recnikAvailable,
} from '../../../recnik.js';
import type { SlozilicaInternalState } from './SlozilicaState.js';
import {
  DEAL_ATTEMPTS,
  MIN_BEST_WORD_LENGTH,
  NAJAVA_DURATION,
  PISANJE_DURATION,
  REZULTATI_DURATION,
  emptyRound,
} from './SlozilicaState.js';

/**
 * Složilica — 7/9/11 pločica (izbor domaćina), do dva minuta, najduža reč
 * nosi rundu. Runda se zatvara ranije čim svi kažu „gotov sam“.
 *
 * Anti-leak: dok traje `pisanje`, u broadcast ide SAMO broj pronađenih reči po
 * igraču — nikad same reči. Inače bi protivnik na hostless telefonu čitao tuđe
 * rešenje i prepisivao ga. Najduže moguće reči se takođe drže do rezultata.
 */
export class SlozilicaModule extends BaseGameModule {
  readonly gameId = 'slozilica';

  private state!: SlozilicaInternalState;
  private timings: Record<string, number> = {};

  validateStart(): string | null {
    // Bez rečnika nema provere reči — bolje odbiti start nego pustiti igru u
    // kojoj ništa nije validno.
    if (!recnikAvailable()) {
      return 'Rečnik nije dostupan na serveru — Složilica ne može da počne.';
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const config = customContent as
      | { roundCount?: unknown; slozilicaLetters?: unknown }
      | undefined;
    const letterCount = clampLetterCount(config?.slozilicaLetters);
    const { letters, bestPossible } = this.dealLetters(letterCount);
    this.state = {
      phase: 'najava',
      phaseTimeRemaining: this.timings.NAJAVA_DURATION ?? NAJAVA_DURATION,
      currentRound: 1,
      totalRounds: clampGameRounds(this.gameId, config?.roundCount),
      letterCount,
      expected: new Set(),
      done: new Set(),
      letters,
      bestPossible,
      rounds: new Map(),
      rejected: new Map(),
      stats: new Map(),
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
    if (this.state.phase !== 'pisanje') return null;

    // „Gotov sam" — runda se zatvara čim to kažu svi koji se očekuju, pa se
    // ne čeka pun tajmer ako je soba završila ranije. Može i da se povuče,
    // dok god runda traje.
    if (action === 'slozilica:done') {
      if (this.state.done.has(playerId)) this.state.done.delete(playerId);
      else this.state.done.add(playerId);
      if (this.allDone(room)) this.finishRound(room);
      return this.buildGameState(room);
    }

    if (action !== 'slozilica:submit') return null;
    // Ko je rekao da je gotov više ne šalje reči (dok se ne predomisli).
    if (this.state.done.has(playerId)) return null;

    const raw = typeof data.word === 'string' ? data.word : '';
    const word = normalizeWord(raw);
    if (!word) return null;

    const round = this.roundFor(playerId);
    const reject = (reason: SlozilicaRejection): GameState => {
      this.state.rejected.set(playerId, { word, reason });
      return this.buildGameState(room);
    };

    if (round.tried.has(word)) return reject('vec-poslato');
    round.tried.add(word);

    if (!isPlausibleWord(word) || [...word].length < SLOZILICA_MIN_WORD) {
      return reject('prekratko');
    }
    if (!canBuildFrom(word, this.state.letters)) return reject('nema-slova');
    if (!isWord(word)) return reject('nije-rec');

    const points = scoreWord(word);
    round.words.push({ word, points });
    if (points > round.points) {
      round.points = points;
      round.best = word;
    }
    this.state.rejected.delete(playerId);

    const stats = this.statsFor(playerId);
    stats.totalWords += 1;
    if ([...word].length > [...stats.longest].length) stats.longest = word;

    return this.buildGameState(room);
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;
    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining > 0) return this.buildGameState(room);

    switch (this.state.phase) {
      case 'najava':
        this.state.phase = 'pisanje';
        this.state.phaseTimeRemaining = PISANJE_DURATION;
        this.state.expected = new Set(
          room.players.filter((p) => p.isConnected).map((p) => p.id)
        );
        this.state.done = new Set();
        break;
      case 'pisanje':
        this.finishRound(room);
        break;
      case 'rezultati':
        this.nextRoundOrEnd();
        break;
    }
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    // Stiže tek kad istekne grejs — tada mesto zaista više ne treba čekati.
    if (this.state.phase !== 'pisanje') return null;
    this.state.expected.delete(playerId);
    this.state.done.delete(playerId);
    if (this.allDone(room)) this.finishRound(room);
    return this.buildGameState(room);
  }

  /** Svi očekivani (koji su još u sobi) rekli su „gotov sam". */
  private allDone(room: Room): boolean {
    if (this.state.phase !== 'pisanje') return false;
    let waiting = 0;
    for (const id of this.state.expected) {
      if (!room.players.some((p) => p.id === id)) continue; // otišao zauvek
      if (!this.state.done.has(id)) return false;
      waiting += 1;
    }
    return waiting > 0;
  }

  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const candidates: DiplomaCandidate[] = [];
    const entries = [...this.state.stats.entries()].filter(([id]) =>
      room.players.some((p) => p.id === id)
    );
    if (entries.length === 0) return candidates;

    // Najduža pojedinačna reč u celoj partiji.
    const longest = entries.reduce((a, b) =>
      [...b[1].longest].length > [...a[1].longest].length ? b : a
    );
    if ([...longest[1].longest].length >= 5) {
      candidates.push({
        playerId: longest[0],
        awardId: 'slovoslagac',
        priority: 68,
        subtitle: `„${longest[1].longest}" — ${[...longest[1].longest].length} slova`,
      });
    }

    // Najviše pronađenih reči ukupno.
    const most = entries.reduce((a, b) =>
      b[1].totalWords > a[1].totalWords ? b : a
    );
    if (most[1].totalWords >= 5 && most[0] !== longest[0]) {
      candidates.push({
        playerId: most[0],
        awardId: 'hodajuci-recnik',
        priority: 60,
        subtitle: `${most[1].totalWords} reči ukupno`,
      });
    }

    // Runde bez ijedne validne reči.
    const blank = entries.reduce((a, b) =>
      b[1].blankRounds > a[1].blankRounds ? b : a
    );
    if (blank[1].blankRounds >= 2) {
      candidates.push({
        playerId: blank[0],
        awardId: 'prazan-papir',
        priority: 54,
        subtitle: `${blank[1].blankRounds} runde bez reči`,
      });
    }

    return candidates;
  }

  // --- Tok igre ------------------------------------------------------------

  /**
   * Izvlači 7 pločica i odmah traži najduže reči. Set se odbacuje ako od njega
   * ne može bar petoslovna reč — inače runda ume da bude mrtva.
   */
  private dealLetters(count: number): {
    letters: string[];
    bestPossible: string[];
  } {
    let fallback: { letters: string[]; bestPossible: string[] } | null = null;

    for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
      const letters = generateLetters(count);
      const bestPossible = findBestWords(letters, 5);
      const bestLength = bestPossible[0] ? [...bestPossible[0]].length : 0;
      if (bestLength >= MIN_BEST_WORD_LENGTH) return { letters, bestPossible };
      // Zapamti najbolji promašaj za slučaj da nijedan pokušaj ne uspe.
      if (!fallback || bestLength > ([...(fallback.bestPossible[0] ?? '')].length)) {
        fallback = { letters, bestPossible };
      }
    }
    return fallback ?? { letters: generateLetters(count), bestPossible: [] };
  }

  private roundFor(playerId: string) {
    let round = this.state.rounds.get(playerId);
    if (!round) {
      round = emptyRound();
      this.state.rounds.set(playerId, round);
    }
    return round;
  }

  private statsFor(playerId: string) {
    let s = this.state.stats.get(playerId);
    if (!s) {
      s = { totalWords: 0, longest: '', blankRounds: 0 };
      this.state.stats.set(playerId, s);
    }
    return s;
  }

  private finishRound(room: Room): void {
    for (const player of room.players) {
      const round = this.state.rounds.get(player.id);
      if (round && round.points > 0) {
        player.score += round.points;
      } else if (player.isConnected) {
        this.statsFor(player.id).blankRounds += 1;
      }
    }
    this.state.phase = 'rezultati';
    this.state.phaseTimeRemaining =
      this.timings.REZULTATI_DURATION ?? REZULTATI_DURATION;
  }

  private nextRoundOrEnd(): void {
    if (this.state.currentRound >= this.state.totalRounds) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }
    const { letters, bestPossible } = this.dealLetters(this.state.letterCount);
    this.state.currentRound += 1;
    this.state.letters = letters;
    this.state.bestPossible = bestPossible;
    this.state.rounds = new Map();
    this.state.rejected = new Map();
    this.state.expected = new Set();
    this.state.done = new Set();
    this.state.phase = 'najava';
    this.state.phaseTimeRemaining = this.timings.NAJAVA_DURATION ?? NAJAVA_DURATION;
  }

  // --- Slanje stanja -------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const hostData: SlozilicaHostData = {
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      letters: this.state.letters,
    };

    if (this.state.phase === 'pisanje') {
      // Samo brojači — reči bi bile gotov prepis za protivnika.
      hostData.foundCounts = room.players
        .filter((p) => p.isConnected)
        .map((p) => ({
          playerId: p.id,
          count: this.state.rounds.get(p.id)?.words.length ?? 0,
          done: this.state.done.has(p.id),
        }));
    }

    if (this.state.phase === 'rezultati') {
      hostData.results = this.buildResults(room);
      hostData.bestPossible = this.state.bestPossible;
    }

    if (this.state.phase === 'rezultati' || this.state.phase === 'ended') {
      hostData.leaderboard = room.players
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          avatarEmoji: p.avatarEmoji,
          score: p.score,
          rank: 0,
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));
    }

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const round = this.state.rounds.get(player.id);
      const pd: SlozilicaControllerData = {
        done: this.state.done.has(player.id),
        myWords: round?.words ?? [],
        myBest: round?.best ?? '',
        myPoints: round?.points ?? 0,
        score: player.score,
      };
      const rejected = this.state.rejected.get(player.id);
      if (rejected) pd.lastRejected = rejected;
      playerData[player.id] = pd as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data: { phase: this.state.phase, host: hostData },
      playerData,
    };
  }

  private buildResults(room: Room): SlozilicaPlayerResult[] {
    return room.players
      .filter((p) => p.isConnected || this.state.rounds.has(p.id))
      .map<SlozilicaPlayerResult>((p) => {
        const round = this.state.rounds.get(p.id);
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          avatarEmoji: p.avatarEmoji,
          bestWord: round?.best ?? '',
          points: round?.points ?? 0,
          wordCount: round?.words.length ?? 0,
        };
      })
      .sort((a, b) => b.points - a.points);
  }
}
