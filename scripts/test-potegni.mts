/**
 * Povuci-potegni — generator zadataka, pravila modula i socket prolaz.
 *
 *   npx tsx scripts/test-potegni.mts               # sve
 *   npx tsx scripts/test-potegni.mts --gen         # samo generator (+ ispis primera)
 *   npx tsx scripts/test-potegni.mts --rules       # generator + pravila, bez soketa
 *
 * Generator: svaki generator se vrti po 400 puta — ponuda mora da sadrži tačan
 * odgovor, ponude su različite, brojčani odgovor je konačan, pozitivan i
 * staje u tastaturu telefona (7 znakova, decimalni zarez).
 *
 * Pravila: modul se vozi direktno (lažna soba) — tačni odgovori dovuku čvor
 * do crte, promašaj blokira 3 s i pomera čvor ka protivniku, zastareo
 * zadatak se ignoriše, bot u solo modu sam dovuče čvor, isteklo vreme bira
 * stranu kojoj je čvor bliži, pomirenje timova, pauza pomera blokadu.
 *
 * Socket prolaz: domaćin + 3 bota preko socket.io-client-a — izbor tima,
 * pomirenje i start preko host:game-action, zadaci stižu samo u lični deo,
 * odgovor NIKAD ne putuje na žici, kraj preko „preskoči" i game:ended.
 */

import { createServer } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import type { GameState, PotegniControllerData, PotegniHostData, Player, Room } from '@igra/shared';
import { POTEGNI_BLOKADA_MS, POTEGNI_BOT_MS, formatPotegniBroj } from '@igra/shared';
import { SVI_GENERATORI, napraviZadatak } from '../packages/server/src/game/games/povuci-potegni/zadaci.js';
import { PovuciPotegniModule } from '../packages/server/src/game/games/povuci-potegni/PovuciPotegniModule.js';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const flag = (name: string) => process.argv.includes(`--${name}`);

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  const line = `${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures.push(line);
}

// --- generator ----------------------------------------------------------------

function generator(): void {
  console.log('\n— generator zadataka —');
  let lose = 0;
  const primeri: string[] = [];
  for (const { predmet, nivo, gen } of SVI_GENERATORI) {
    for (let i = 0; i < 400; i++) {
      const z = gen(Math.random);
      const opis = `${predmet}/${nivo}: ${z.tekst} ${z.podtekst ?? ''}`;
      const problem = (msg: string) => {
        if (lose < 12) console.log(`    ${msg}: ${opis} → ${String(z.odgovor)} [${z.opcije?.join(' | ') ?? ''}]`);
        lose += 1;
      };
      if (/NaN|undefined|Infinity/.test(z.tekst + (z.podtekst ?? ''))) problem('loš tekst');
      if (z.predmet !== predmet) problem('pogrešan predmet');
      if (z.opcije) {
        if (typeof z.odgovor !== 'string') problem('izbor bez string odgovora');
        if (!z.opcije.includes(z.odgovor as string)) problem('ponude bez tačnog');
        if (new Set(z.opcije).size !== z.opcije.length) problem('duple ponude');
        if (z.opcije.length < 3) problem('premalo ponuda');
      } else {
        const n = z.odgovor as number;
        if (typeof n !== 'number' || !Number.isFinite(n)) problem('odgovor nije broj');
        else {
          if (n <= 0) problem('odgovor ≤ 0 (tastatura nema minus)');
          const s = formatPotegniBroj(n);
          if (s.length > 7) problem(`odgovor ne staje u tastaturu (${s})`);
          if (Math.abs(Number(s.replace(',', '.')) - n) > 1e-9) problem('odgovor gubi preciznost');
        }
      }
      if (i === 0) primeri.push(`${predmet}/${nivo}: ${z.tekst}${z.podtekst ? ` · ${z.podtekst}` : ''} → ${typeof z.odgovor === 'number' ? formatPotegniBroj(z.odgovor) : z.odgovor}`);
    }
  }
  check(`${SVI_GENERATORI.length} generatora × 400 zadataka bez greške`, lose === 0, `${lose} problema`);
  const z = napraviZadatak(['hemija'], 'mesovito');
  check('napraviZadatak poštuje predmet', z.predmet === 'hemija');
  if (flag('gen')) for (const p of primeri) console.log(`    ${p}`);
}

// --- pravila ------------------------------------------------------------------

function fakeRoom(n: number): Room {
  const players: Player[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Igrač ${i}`,
    avatarColor: '#ce7c3a',
    avatarEmoji: '🦊',
    isConnected: true,
    score: 0,
    reconnectToken: `t${i}`,
  }));
  return {
    code: 'TST',
    hostSocketId: 'h',
    hostless: false,
    remoteHostPlayerId: null,
    players,
    status: 'in-game',
    currentGameId: 'povuci-potegni',
    settings: { maxPlayers: 12, roundCount: 1 },
    createdAt: Date.now(),
    chatMessages: [],
    hostConnected: true,
    idleSince: null,
  };
}

type Interno = {
  igraci: Map<string, { tim: string; zadatak: { id: number; odgovor: number | string } | null; blokDo: number }>;
  pozicija: number;
};
const interno = (m: PovuciPotegniModule) => m as unknown as Interno;
const hostOf = (s: GameState) => s.data.host as PotegniHostData;
const tacan = (m: PovuciPotegniModule, id: string) => {
  const z = interno(m).igraci.get(id)!.zadatak!;
  return { zadatakId: z.id, vrednost: typeof z.odgovor === 'string' ? z.odgovor : formatPotegniBroj(z.odgovor) };
};
const pogresan = (m: PovuciPotegniModule, id: string) => {
  const z = interno(m).igraci.get(id)!.zadatak!;
  return { zadatakId: z.id, vrednost: typeof z.odgovor === 'string' ? '__nije__' : '999999' };
};

/** Od izbora timova do vuče, bez čekanja na sat. */
function doVuce(m: PovuciPotegniModule, room: Room, s: GameState): GameState {
  let st = s;
  if (st.phase === 'timovi') st = m.onHostAction(room, st, 'potegni:pocni')!;
  st = m.onHostSkip(room, st)!; // spremni → vuca
  return st;
}

function pravila(): void {
  console.log('\n— pravila —');

  // validateStart
  const m0 = new PovuciPotegniModule();
  check('dva tima sa jednim igračem se odbijaju', !!m0.validateStart(fakeRoom(1), { potegniMode: 'timovi' }));
  check('solo sa jednim igračem prolazi', m0.validateStart(fakeRoom(1), { potegniMode: 'solo' }) === null);

  // Timovi, izbor, pomirenje
  {
    const room = fakeRoom(5);
    const m = new PovuciPotegniModule();
    let s = m.onStart(room, { potegniMode: 'timovi', potegniTrajanje: 120 });
    check('počinje izborom timova', s.phase === 'timovi');
    const h = hostOf(s);
    const nC = h.igraci.filter((i) => i.tim === 'crveni').length;
    check('početni timovi su izjednačeni', Math.abs(nC - (5 - nC)) <= 1, `${nC} na ${5 - nC}`);
    for (const p of room.players) s = m.onPlayerAction(room, s, p.id, 'potegni:tim', { tim: 'plavi' }) ?? s;
    check('svi mogu u plave', hostOf(s).igraci.every((i) => i.tim === 'plavi'));
    s = m.onHostAction(room, s, 'potegni:pomiri')!;
    const c2 = hostOf(s).igraci.filter((i) => i.tim === 'crveni').length;
    check('pomirenje vraća razliku na ≤ 1', Math.abs(c2 - (5 - c2)) <= 1, `${c2} na ${5 - c2}`);
    s = doVuce(m, room, s);
    check('posle odbrojavanja ide vuča', s.phase === 'vuca');
    const pd = s.playerData.p0 as unknown as PotegniControllerData;
    check('zadatak je u ličnom delu', !!pd.zadatak?.tekst);
    check('odgovor NIJE u ličnom delu', !JSON.stringify(s.playerData).includes('"odgovor"'));
    check('odgovor NIJE u javnom delu', !JSON.stringify(s.data).includes('"odgovor"'));

    // Promašaj: blokada + pomeranje ka protivniku
    const tim0 = interno(m).igraci.get('p0')!.tim;
    const pre = interno(m).pozicija;
    s = m.onPlayerAction(room, s, 'p0', 'potegni:odgovor', pogresan(m, 'p0'))!;
    const posle = interno(m).pozicija;
    check('promašaj pomera čvor ka protivniku', tim0 === 'crveni' ? posle < pre : posle > pre, `${pre} → ${posle}`);
    const pd0 = s.playerData.p0 as unknown as PotegniControllerData;
    check('promašaj nosi tačan odgovor tom igraču', !!pd0.promasaj?.tacno);
    check('blokiran igrač je u javnom spisku', hostOf(s).blokirani.includes('p0'));
    const blok = m.onPlayerAction(room, s, 'p0', 'potegni:odgovor', tacan(m, 'p0'));
    check('za vreme blokade odgovor se ignoriše', blok === null);
    // Pauza od 10 s pomera blokadu.
    const blokDo = interno(m).igraci.get('p0')!.blokDo;
    m.onResume(10_000);
    check('pauza pomera blokadu', interno(m).igraci.get('p0')!.blokDo === blokDo + 10_000);

    // Zastareo zadatak
    const id1 = interno(m).igraci.get('p1')!.zadatak!.id;
    s = m.onPlayerAction(room, s, 'p1', 'potegni:odgovor', tacan(m, 'p1'))!;
    const stari = m.onPlayerAction(room, s, 'p1', 'potegni:odgovor', { zadatakId: id1, vrednost: '1' });
    check('odgovor na stari zadatak se ignoriše', stari === null);

    // Crveni dovuku do crte samo tačnim odgovorima.
    const crveni = [...interno(m).igraci.entries()].filter(([, i]) => i.tim === 'crveni').map(([id]) => id);
    let n = 0;
    while (s.phase === 'vuca' && n < 200) {
      const id = crveni[n % crveni.length];
      s = m.onPlayerAction(room, s, id, 'potegni:odgovor', tacan(m, id)) ?? s;
      n += 1;
    }
    const kraj = hostOf(s);
    check('crveni dovuku čvor do crte', s.phase === 'kraj' && kraj.ishod?.pobednik === 'crveni' && kraj.ishod.razlog === 'crta', `${n} odgovora`);
    const ocekivano = Math.ceil(100 / (20 / crveni.length));
    check('broj potrebnih tačnih prati veličinu tima', n >= ocekivano - 2 && n <= ocekivano + 4, `${n} (≈${ocekivano})`);
    check('pobednici dobijaju bonus', room.players.filter((p) => crveni.includes(p.id)).every((p) => p.score >= 500));
    check('statistika na kraju', (kraj.statistika?.length ?? 0) === 5);
    // Kraj → ended
    s = m.onHostSkip(room, s)!;
    check('posle prikaza pobednika igra se završava', s.phase === 'ended');
    const awards = m.getAwardCandidates(room);
    check('diplome za brzi račun', awards.some((a) => a.awardId === 'brzi-racun'));
  }

  // Solo: bot sam dovuče čvor
  {
    const room = fakeRoom(1);
    const m = new PovuciPotegniModule();
    let s = m.onStart(room, { potegniMode: 'solo', potegniBot: 'tezak', potegniTrajanje: 300 });
    check('solo preskače izbor timova', s.phase === 'spremni');
    s = m.onHostSkip(room, s)!;
    let sec = 0;
    while (s.phase === 'vuca' && sec < 400) {
      s = m.onTick(room, s, 1000) ?? s;
      sec += 1;
    }
    const ocek = Math.ceil(100 / 12) * (POTEGNI_BOT_MS.tezak / 1000);
    check('bot sam dovuče čvor do svoje crte', hostOf(s).ishod?.pobednik === 'plavi' && hostOf(s).ishod?.razlog === 'crta', `${sec} s (≈${ocek})`);
  }

  // Isteklo vreme: pobeđuje strana kojoj je čvor bliži
  {
    const room = fakeRoom(4);
    const m = new PovuciPotegniModule();
    let s = doVuce(m, room, m.onStart(room, { potegniMode: 'timovi', potegniTrajanje: 120 }));
    const plavi = [...interno(m).igraci.entries()].find(([, i]) => i.tim === 'plavi')![0];
    s = m.onPlayerAction(room, s, plavi, 'potegni:odgovor', tacan(m, plavi))!;
    for (let i = 0; i < 125 && s.phase === 'vuca'; i++) s = m.onTick(room, s, 1000) ?? s;
    check('kad istekne vreme, bliža strana pobeđuje', hostOf(s).ishod?.pobednik === 'plavi' && hostOf(s).ishod?.razlog === 'vreme');
    void POTEGNI_BLOKADA_MS;
  }

  // Nerešeno
  {
    const room = fakeRoom(2);
    const m = new PovuciPotegniModule();
    let s = doVuce(m, room, m.onStart(room, { potegniMode: 'timovi', potegniTrajanje: 120 }));
    s = m.onHostSkip(room, s)!; // „Završi vuču"
    check('preskok u vuči završava igru, čvor na sredini = nerešeno', s.phase === 'kraj' && hostOf(s).ishod?.pobednik === null);
  }
}

// --- socket prolaz --------------------------------------------------------------

type AnySocket = Socket<Record<string, (...a: never[]) => void>, Record<string, (...a: never[]) => void>>;
const connect = (url: string) => io(url, { transports: ['websocket'], forceNew: true }) as unknown as AnySocket;
function once<T>(socket: AnySocket, event: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`istekao timeout čekajući "${event}"`)), timeoutMs);
    socket.once(event as never, ((data: T) => {
      clearTimeout(timer);
      resolve(data);
    }) as never);
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function socketRun(url: string): Promise<void> {
  console.log('\n— socket prolaz: dva tima, 3 igrača —');
  const host = connect(url);
  await once(host, 'connect');
  host.emit('host:create-room' as never, {} as never);
  const { roomCode } = await once<{ roomCode: string }>(host, 'host:room-created');

  const socks: AnySocket[] = [];
  const ids: string[] = [];
  const wire: string[] = [];
  let state: GameState | null = null;
  const mine = new Map<string, PotegniControllerData>();
  let ended: { finalScores: { playerId: string; score: number }[] } | null = null;

  for (const name of ['Pera', 'Mika', 'Žika']) {
    const sock = connect(url);
    await once(sock, 'connect');
    sock.emit('player:join-room' as never, { roomCode, playerName: name } as never);
    const joined = await once<{ player: { id: string } }>(sock, 'player:joined');
    const id = joined.player.id;
    socks.push(sock);
    ids.push(id);
    sock.on('game:state-update' as never, ((d: { gameState: GameState }) => {
      wire.push(JSON.stringify(d));
      state = d.gameState;
    }) as never);
    sock.on('game:started' as never, ((d: { gameState: GameState }) => {
      wire.push(JSON.stringify(d));
      state = d.gameState;
    }) as never);
    sock.on('game:player-state' as never, ((d: { playerData: Record<string, unknown> }) => {
      wire.push(JSON.stringify(d));
      const pd = d.playerData[id] as PotegniControllerData | undefined;
      if (pd) mine.set(id, pd);
    }) as never);
    sock.on('game:ended' as never, ((d: typeof ended) => {
      ended = d;
    }) as never);
  }

  const until = async (label: string, cond: () => boolean, ms = 8000) => {
    const t0 = Date.now();
    while (!cond() && Date.now() - t0 < ms) await sleep(30);
    check(label, cond());
  };

  host.emit('host:start-game' as never, {
    gameId: 'povuci-potegni',
    potegniMode: 'timovi',
    potegniPredmeti: ['matematika'],
    potegniTezina: 'osnovna',
    potegniTrajanje: 120,
  } as never);
  await until('igra kreće u izbor timova', () => (state as GameState | null)?.phase === 'timovi');

  for (const s of socks) s.emit('game:player-action' as never, { action: 'potegni:tim', data: { tim: 'crveni' } } as never);
  await until('svi prešli u crvene', () => hostOf(state!).igraci.every((i) => i.tim === 'crveni'));
  host.emit('host:game-action' as never, { action: 'potegni:pomiri' } as never);
  await until('TV pomiri timove', () => hostOf(state!).igraci.some((i) => i.tim === 'plavi'));
  host.emit('host:game-action' as never, { action: 'potegni:pocni' } as never);
  await until('TV pokreće igru → odbrojavanje', () => state!.phase === 'spremni');
  await until('posle odbrojavanja vuča', () => state!.phase === 'vuca', 5000);
  await until('svaki telefon ima svoj zadatak', () => ids.every((id) => !!mine.get(id)?.zadatak));

  // Promašaji: „1" je retko tačno; blokada mora da se vidi javno.
  for (let i = 0; i < socks.length; i++) {
    const z = mine.get(ids[i])!.zadatak!;
    socks[i].emit('game:player-action' as never, {
      action: 'potegni:odgovor',
      data: { zadatakId: z.id, vrednost: z.opcije ? '__nije__' : '987654' },
    } as never);
  }
  await until('promašaji blokiraju igrače', () => hostOf(state!).blokirani.length === 3);
  await until('promašaj stiže igraču sa tačnim odgovorom', () => ids.every((id) => !!mine.get(id)?.promasaj?.tacno));
  await until('blokada se sama skida posle 3 s', () => hostOf(state!).blokirani.length === 0, 6000);

  host.emit('host:flow-action' as never, { action: 'skip' } as never);
  await until('„Završi vuču" vodi na kraj', () => state!.phase === 'kraj');
  check('kraj ima ishod i statistiku', !!hostOf(state!).ishod && (hostOf(state!).statistika?.length ?? 0) === 3);
  host.emit('host:flow-action' as never, { action: 'skip' } as never);
  await until('game:ended stiže', () => !!ended);

  const leak = wire.filter((w) => w.includes('"odgovor"'));
  check('odgovor nijednom nije prošao žicom', leak.length === 0, `${wire.length} poruka`);
  for (const s of [host, ...socks]) s.disconnect();
}

async function main(): Promise<void> {
  generator();
  if (flag('gen')) return;
  pravila();
  if (flag('rules')) return;

  const timingFile = path.join(mkdtempSync(path.join(tmpdir(), 'potegni-')), 'timing.json');
  writeFileSync(timingFile, JSON.stringify({ 'povuci-potegni': { SPREMNI_DURATION: 2, KRAJ_DURATION: 4 } }));
  initTimingConfig(timingFile);
  const httpServer = createServer();
  setupSocket(httpServer, '*', { questionPacksDir: path.join(REPO_ROOT, 'question-packs') });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const url = `http://localhost:${(httpServer.address() as { port: number }).port}`;
  await socketRun(url);
  httpServer.close();
}

main()
  .catch((err) => {
    console.error(err);
    failures.push(String(err));
  })
  .finally(() => {
    console.log(failures.length === 0 ? '\nSVE OK' : `\n${failures.length} greška(ka)`);
    process.exit(failures.length === 0 ? 0 : 1);
  });
