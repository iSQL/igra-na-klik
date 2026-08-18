/**
 * Headless prolaz kroz partiju igre Lažov.
 *
 *   npx tsx scripts/test-fibbage.mts [--players <n>] [--rounds <n>] [--pack <id>]
 *
 * Diže server u procesu, spaja domaćina i N botova preko `socket.io-client` i
 * odigra celu partiju iz `fibbage-packs/`.
 *
 * Zašto postoji: bodovanje Lažova se ne vidi sa ekrana. Bot koji otkuca baš
 * tačan odgovor, bot koji namerno ćuti celu rundu i dva bota koji napišu istu
 * laž — sve troje se u UI-ju ponašaju isto, a nose potpuno različite poene.
 * Test proverava upravo to, plus da tačan odgovor nikad ne procuri u
 * broadcast polovinu stanja pre faze otkrivanja.
 */

import { createServer } from 'http';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import type { FibbageResultData, PlayerAward } from '@igra/shared';
import { parseFibbagePack } from '@igra/shared';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PACKS_DIR = path.join(REPO_ROOT, 'fibbage-packs');

const TRUTH_POINTS = 500;
const FOOL_POINTS_PER_VOTER = 100;

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const PLAYERS = Math.max(4, Math.min(8, Number(arg('players') ?? 5)));
const ROUNDS = Math.max(3, Math.min(10, Number(arg('rounds') ?? 3)));
const PACK_ID = arg('pack') ?? 'opsta';

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

type AnySocket = Socket<
  Record<string, (...a: never[]) => void>,
  Record<string, (...a: never[]) => void>
>;

function connect(url: string): AnySocket {
  return io(url, { transports: ['websocket'], forceNew: true }) as unknown as AnySocket;
}

function once<T>(socket: AnySocket, event: string, timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`istekao timeout čekajući "${event}"`)),
      timeoutMs
    );
    socket.once(event as never, ((data: T) => {
      clearTimeout(timer);
      resolve(data);
    }) as never);
  });
}

interface GameStateLite {
  phase: string;
  round: number;
  timeRemaining: number;
  data: Record<string, unknown>;
  playerData: Record<string, Record<string, unknown>>;
}

async function main(): Promise<void> {
  // Odgovori nam trebaju da bi bot mogao namerno da otkuca istinu. Kad pack
  // ne postoji (--pack nepostojeci) prelazimo u fallback režim: proverava se
  // samo da partija i dalje ide — na ugrađenoj banci — jer to je jedini put
  // koji igrač vidi kad admin obriše sve packove.
  let answerByText = new Map<string, string>();
  let fallbackMode = false;
  try {
    const rawPack = JSON.parse(
      readFileSync(path.join(PACKS_DIR, `${PACK_ID}.json`), 'utf-8')
    );
    const parsed = parseFibbagePack(rawPack);
    if (!parsed.ok) {
      console.error(`pack "${PACK_ID}" ne prolazi validaciju: ${parsed.error}`);
      process.exit(1);
    }
    answerByText = new Map(parsed.pack.questions.map((q) => [q.text, q.answer]));
    console.log(`pack "${PACK_ID}": ${parsed.pack.questions.length} pitanja — OK`);
  } catch {
    fallbackMode = true;
    answerByText = new Map();
    console.log(`pack "${PACK_ID}" ne postoji — test ugrađene banke (fallback)`);
  }

  const timingFile = path.join(mkdtempSync(path.join(tmpdir(), 'lazov-')), 'timing.json');
  writeFileSync(
    timingFile,
    JSON.stringify({
      fibbage: {
        SHOWING_QUESTION_DURATION: 2,
        SHOWING_RESULTS_DURATION: 2,
        LEADERBOARD_DURATION: 2,
      },
    })
  );
  initTimingConfig(timingFile);

  const httpServer = createServer();
  setupSocket(httpServer, '*', { fibbagePacksDir: PACKS_DIR });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  const url = `http://localhost:${port}`;

  const host = connect(url);
  await once(host, 'connect');
  host.emit('host:create-room' as never, {} as never);
  const created = await once<{ roomCode: string }>(host, 'host:room-created');
  const roomCode = created.roomCode;
  console.log(`soba ${roomCode} · ${PLAYERS} igrača · ${ROUNDS} rundi`);

  const names = ['Pera', 'Mika', 'Žika', 'Lena', 'Ana', 'Bane', 'Cane', 'Dara'].slice(0, PLAYERS);
  const players: AnySocket[] = [];
  const ids: string[] = [];
  for (const name of names) {
    const sock = connect(url);
    await once(sock, 'connect');
    sock.emit('player:join-room' as never, { roomCode, playerName: name } as never);
    const joined = await once<{ player: { id: string } }>(sock, 'player:joined');
    players.push(sock);
    ids.push(joined.player.id);
  }

  // Uloge botova, iste kroz celu partiju:
  //   0 — otkuca tačan odgovor (auto-find)
  //   1 — nikad ništa ne pošalje (ćutolog), ali glasa
  //   2, 3 — napišu ISTU laž (spajanje duplikata)
  //   ostali — svoja laž
  const AUTO = 0;
  const MUTE = 1;
  const TWIN_A = 2;
  const TWIN_B = 3;
  const TWIN_LIE = 'zajednicka-laz';

  // --- praćenje procurivanja -------------------------------------------------
  // Tačan odgovor sme da se pojavi u broadcast polovini tek od `voting`
  // (tada je jedna od ponuđenih opcija) — nikad ranije.
  let leaks = 0;
  let sawVoting = false;
  let sawReveal = false;
  const seenLoading: boolean[] = [];

  const roundChecks: string[] = [];
  let currentAnswer: string | null = null;

  host.on('game:state-update' as never, ((payload: { gameState: GameStateLite }) => {
    const gs = payload.gameState;
    const q = gs.data.question as { text?: string } | undefined;
    if (q?.text) currentAnswer = answerByText.get(q.text) ?? null;

    if (gs.phase === 'showing-question') seenLoading.push(gs.data.loading === true);

    if (
      currentAnswer &&
      (gs.phase === 'showing-question' || gs.phase === 'writing-answers')
    ) {
      const blob = JSON.stringify(gs.data).toLowerCase();
      if (blob.includes(currentAnswer.toLowerCase())) leaks++;
    }
    if (gs.phase === 'voting') sawVoting = true;
  }) as never);

  // --- bot ponašanje ---------------------------------------------------------
  // Zajednička polovina stanja stiže kroz `game:state-update` (broadcast),
  // a privatni deo kroz `game:player-state` — bot mora da spoji oba, isto
  // kao pravi telefon.
  const lastPhase: string[] = new Array(PLAYERS).fill('');
  const shared: (GameStateLite | null)[] = new Array(PLAYERS).fill(null);
  const priv: Record<string, unknown>[] = players.map(() => ({}));

  function act(i: number): void {
    const gs = shared[i];
    if (!gs) return;
    const mine = priv[i] ?? {};
    const key = `${gs.round}:${gs.phase}`;

    if (gs.phase === 'writing-answers') {
      // The private slice must be the one for THIS phase. Acting on a slice
      // left over from the previous phase is how a bot ends up voting for its
      // own lie (myFakeOptionId still undefined) and getting silently refused.
      if (!('hasSubmitted' in mine)) return;
      if (mine.hasSubmitted || lastPhase[i] === key) return;
      if (i === MUTE) {
        lastPhase[i] = key;
        return; // namerno ćuti
      }
      const q = gs.data.question as { text?: string } | undefined;
      const truth = q?.text ? answerByText.get(q.text) : undefined;
      const text =
        i === AUTO && truth
          ? truth
          : i === TWIN_A || i === TWIN_B
            ? TWIN_LIE
            : `laz-igraca-${i}`;
      lastPhase[i] = key;
      players[i].emit('game:player-action' as never, {
        action: 'fibbage:submit-answer',
        data: { text },
      } as never);
      return;
    }

    if (gs.phase === 'voting') {
      if (!('hasVoted' in mine)) return;
      if (mine.hasVoted || mine.canVote === false) return;
      if (lastPhase[i] === key) return;
      const options = (gs.data.options as { id: string; text: string }[]) ?? [];
      // Svako glasa za prvu opciju koja nije njegova — dovoljno da i istina i
      // laži pokupe glasove kroz partiju.
      const pick = options.find((o) => o.id !== mine.myFakeOptionId);
      if (pick) {
        lastPhase[i] = key;
        players[i].emit('game:player-action' as never, {
          action: 'fibbage:vote',
          data: { optionId: pick.id },
        } as never);
      }
      return;
    }

    lastPhase[i] = key;
  }

  players.forEach((sock, i) => {
    sock.on('game:state-update' as never, ((payload: { gameState: GameStateLite }) => {
      shared[i] = payload.gameState;
      act(i);
    }) as never);
    sock.on('game:player-state' as never, ((payload: {
      playerData: Record<string, Record<string, unknown>>;
    }) => {
      priv[i] = payload.playerData?.[ids[i]] ?? {};
      act(i);
    }) as never);
  });

  // --- provera otkrivanja ----------------------------------------------------
  host.on('game:state-update' as never, ((payload: { gameState: GameStateLite }) => {
    const gs = payload.gameState;
    if (gs.phase !== 'showing-results' || !gs.data.results) return;
    const res = gs.data.results as FibbageResultData;
    const tag = `runda ${gs.round}`;
    if (roundChecks.includes(tag)) return;
    roundChecks.push(tag);
    sawReveal = true;

    // Svaka laž mora imati autora — to je poenta novog otkrivanja.
    const orphan = res.revealOptions.filter(
      (o) => !o.isReal && o.authorNames.length === 0
    );
    check(`${tag}: svaka laž ima autora`, orphan.length === 0, `${orphan.length} bez autora`);

    // Istina je poslednja u nizu (redosled otkrivanja ide ka poenti).
    const last = res.revealOptions[res.revealOptions.length - 1];
    check(`${tag}: istina je poslednja u otkrivanju`, last?.isReal === true);

    // Broj glasova raste ka kraju među lažima.
    const lieVotes = res.revealOptions
      .filter((o) => !o.isReal)
      .map((o) => o.voterPlayerIds.length);
    const sorted = lieVotes.every((v, idx) => idx === 0 || lieVotes[idx - 1] <= v);
    check(`${tag}: laži poređane po broju glasova`, sorted, lieVotes.join(','));

    // Duplikat: obe blizanačke laži su na ISTOJ opciji.
    const twin = res.revealOptions.find((o) => o.text === TWIN_LIE);
    if (twin) {
      check(
        `${tag}: identične laži spojene u jednu opciju`,
        twin.authorPlayerIds.length === 2,
        `${twin.authorPlayerIds.length} autora`
      );
    }

    // Auto-find: tačno TRUTH_POINTS, nikad duplo.
    const autoEntry = res.results.find((r) => r.playerId === ids[AUTO]);
    if (autoEntry?.foundTruth) {
      const fooled = autoEntry.fooledCount * FOOL_POINTS_PER_VOTER;
      check(
        `${tag}: onaj ko otkuca istinu dobija tačno ${TRUTH_POINTS}`,
        autoEntry.roundScore === TRUTH_POINTS + fooled,
        `dobio ${autoEntry.roundScore}`
      );
    }

    // Ćutolog: nema poena za pogođenu istinu.
    const muteEntry = res.results.find((r) => r.playerId === ids[MUTE]);
    if (muteEntry) {
      check(`${tag}: ćutolog je označen kao "nije pisao"`, muteEntry.wroteLie === false);
      if (muteEntry.foundTruth) {
        check(
          `${tag}: ćutolog ne dobija bonus za istinu`,
          muteEntry.roundScore === 0 && muteEntry.truthBonusWithheld,
          `dobio ${muteEntry.roundScore}`
        );
      }
    }

    // Poeni za prevaru odgovaraju broju glasova.
    for (const opt of res.revealOptions) {
      if (opt.isReal) continue;
      check(
        `${tag}: poeni za laž = glasovi × ${FOOL_POINTS_PER_VOTER}`,
        opt.pointsEarned === opt.voterPlayerIds.length * FOOL_POINTS_PER_VOTER
      );
    }
  }) as never);

  const ended = once<{
    finalScores: { playerId: string; score: number }[];
    awards?: PlayerAward[];
  }>(host, 'game:ended', ROUNDS * 70_000 + 60_000);

  host.emit('host:start-game' as never, {
    gameId: 'fibbage',
    fibbagePackIds: [PACK_ID],
    roundCount: ROUNDS,
  } as never);

  const final = await ended;

  // --- završne provere -------------------------------------------------------
  check('bilo je faze glasanja', sawVoting);
  check('bilo je pitanja (pack ili ugrađena banka)', roundChecks.length > 0);
  check('bilo je faze otkrivanja', sawReveal);
  check('odigrane sve runde', roundChecks.length === ROUNDS, `${roundChecks.length}/${ROUNDS}`);
  check('tačan odgovor ne curi pre glasanja', leaks === 0, `${leaks} procurivanja`);
  check(
    'partija je čekala da se paketi učitaju',
    seenLoading.length === 0 || seenLoading.some((l) => l === false),
    'nijedno stanje nije bilo spremno'
  );

  const autoScore = final.finalScores.find((f) => f.playerId === ids[AUTO])?.score ?? 0;
  const muteScore = final.finalScores.find((f) => f.playerId === ids[MUTE])?.score ?? 0;
  if (!fallbackMode) {
    check(
      'onaj ko zna odgovore vodi ispred ćutologa',
      autoScore > muteScore,
      `${autoScore} vs ${muteScore}`
    );
    check(
      `auto-find ne prelazi ${TRUTH_POINTS} po rundi iz bonusa`,
      autoScore <= ROUNDS * (TRUTH_POINTS + (PLAYERS - 1) * FOOL_POINTS_PER_VOTER),
      `${autoScore}`
    );
  }

  check('svako je dobio diplomu', (final.awards?.length ?? 0) === PLAYERS,
    `${final.awards?.length ?? 0}/${PLAYERS}`);
  const lazovAwards = (final.awards ?? []).filter((a) =>
    ['najveci-lazov', 'detektor-lazi', 'naivcina', 'nevidljivi-lazov', 'duh-lazov'].includes(
      a.awardId
    )
  );
  check('bar jedna diploma je specifična za Lažova', lazovAwards.length > 0);

  console.log('');
  console.log('konačni poredak:');
  for (const f of [...final.finalScores].sort((a, b) => b.score - a.score)) {
    const idx = ids.indexOf(f.playerId);
    const role =
      idx === AUTO ? ' (zna odgovore)'
        : idx === MUTE ? ' (ćuti)'
          : idx === TWIN_A || idx === TWIN_B ? ' (ista laž)' : '';
    console.log(`  ${names[idx]}${role}: ${f.score}`);
  }
  console.log('');
  console.log('diplome:');
  for (const a of final.awards ?? []) {
    const idx = ids.indexOf(a.playerId);
    console.log(`  ${names[idx]}: ${a.emoji} ${a.title}${a.subtitle ? ` — ${a.subtitle}` : ''}`);
  }

  console.log('');
  if (failures.length === 0) {
    console.log('✓ sve provere prolaze');
  } else {
    console.log(`✗ ${failures.length} provera(e) ne prolazi:`);
    for (const f of failures) console.log(`  - ${f}`);
  }

  host.close();
  for (const p of players) p.close();
  httpServer.close();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
