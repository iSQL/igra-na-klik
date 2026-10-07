/**
 * Headless prolaz kroz kviz link (/k/<naziv>): API, PIN, ulaz preko linka,
 * partija sa sopstvenim pitanjem, statistika, istek i brisanje.
 *
 *   npx tsx scripts/test-kviz-link.mts
 *
 * Diže server u procesu (socket.io + /api/k) nad privremenim folderom za
 * linkove; paketi pitanja su pravi, iz repoa.
 */

import express from 'express';
import { createServer } from 'http';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';
import { KvizLinkStore } from '../packages/server/src/kviz-links/kviz-link-store.js';
import { createKvizLinkRouter } from '../packages/server/src/kviz-links/kviz-link-api.js';
import { createKvizLinkAdminRouter } from '../packages/server/src/admin/kviz-link-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

type AnySocket = Socket<
  Record<string, (...a: never[]) => void>,
  Record<string, (...a: never[]) => void>
>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emit = (s: AnySocket, ev: string, data?: unknown) => s.emit(ev as never, data as never);

function once<T>(socket: AnySocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout čekajući "${event}"`)), timeoutMs);
    socket.once(event as never, ((data: T) => {
      clearTimeout(timer);
      resolve(data);
    }) as never);
  });
}

async function until(label: string, pred: () => boolean, ms = 10000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(40);
  }
  check(label, false, 'uslov nije ispunjen na vreme');
  return false;
}

interface StateLite {
  phase: string;
  data: Record<string, unknown>;
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(path.join(tmpdir(), 'kviz-link-'));
  const timingFile = path.join(tmp, 'timing.json');
  writeFileSync(
    timingFile,
    JSON.stringify({
      quiz: { SHOWING_QUESTION_DURATION: 1, SHOWING_RESULTS_DURATION: 1, RICH_RESULTS_DURATION: 1, LEADERBOARD_DURATION: 1 },
    })
  );
  initTimingConfig(timingFile);

  const linksDir = path.join(tmp, 'kviz-links');
  const store = new KvizLinkStore(linksDir);
  store.load();
  const packsDir = path.join(REPO_ROOT, 'question-packs');

  const app = express();
  const httpServer = createServer(app);
  const { roomManager } = setupSocket(httpServer, '*', { questionPacksDir: packsDir, kvizLinks: store });
  app.use('/api/k', createKvizLinkRouter({ store, questionPacksDir: packsDir, roomManager }));
  process.env.ADMIN_TOKEN = 'test-admin';
  app.use('/api/admin', createKvizLinkAdminRouter({ store, roomManager }));
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const base = `http://localhost:${(httpServer.address() as { port: number }).port}`;

  const call = async (method: string, url: string, body?: unknown, token?: string, admin?: boolean) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(admin ? { 'X-Admin-Token': 'test-admin' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'X-Kviz-Token': token } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* empty */
    }
    return { status: res.status, json, text };
  };

  // --- Javna baza ----------------------------------------------------------
  const bank = await call('GET', '/api/k/bank');
  const bankQs = (bank.json.questions ?? []) as { key: string; type: string; text: string }[];
  check('baza: ima pakete i pitanja', bank.status === 200 && bankQs.length > 0, `${bankQs.length}`);
  check(
    'baza: bez odgovora u javnom odgovoru',
    !/"(correctIndex|answer|accept|lat|lng|order|correct)"/.test(bank.text)
  );

  // --- Naziv i pravljenje --------------------------------------------------
  const chk = await call('GET', '/api/k/check?slug=' + encodeURIComponent('Pab Kviz Đurđevdan'));
  check('provera: normalizuje naziv', chk.json.slug === 'pab-kviz-djurdjevdan', String(chk.json.slug));
  check('provera: slobodno', chk.json.available === true);
  const reserved = await call('GET', '/api/k/check?slug=novi');
  check('provera: rezervisan naziv', reserved.json.available === false);

  const slug = 'pab-kviz';
  const now = Date.now();
  const createBody = {
    slug,
    pin: '4817',
    name: 'Pab kviz · Oktobar',
    emoji: '🍺',
    color: '#5a7a4e',
    message: 'Pobednik časti prvu turu',
    validFrom: now - 60_000,
    expiresAt: now + 24 * 3600_000,
    items: [],
    own: [],
  };
  const bad = await call('POST', '/api/k', { ...createBody, pin: '12' });
  check('pravljenje: loš PIN odbijen', bad.status === 400);
  const created = await call('POST', '/api/k', createBody);
  check('pravljenje: 201 + token', created.status === 201 && typeof created.json.token === 'string', created.text);
  let token = created.json.token as string;
  const dup = await call('POST', '/api/k', createBody);
  check('pravljenje: isti naziv je zauzet', dup.status === 409);

  // --- PIN ------------------------------------------------------------------
  const pub = await call('GET', `/api/k/${slug}`);
  check('javno: kartica bez pitanja i PIN-a', pub.status === 200 && !/items|own|pinHash|pinSalt/.test(pub.text), pub.text);
  check('upravljanje bez tokena: 401', (await call('GET', `/api/k/${slug}/manage`)).status === 401);
  check('otključavanje: pogrešan PIN', (await call('POST', `/api/k/${slug}/unlock`, { pin: '0000' })).status === 403);
  const unlocked = await call('POST', `/api/k/${slug}/unlock`, { pin: '4817' });
  check('otključavanje: tačan PIN daje isti token', unlocked.json.token === token);

  // --- Pitanja: 3 iz baze + 1 sopstveno, fiksno, 10 s, bez brzine ----------
  const picked = bankQs.filter((q) => q.type === 'obicno').slice(0, 3).map((q) => q.key);
  const ownText = 'Kako se zove konobar koji radi petkom?';
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await call('POST', `/api/k/${slug}/upload`, { data: png, kind: 'image' }, token);
  check('otpremanje slike', up.status === 200 && typeof up.json.file === 'string', up.text);
  check('otpremljena slika je na disku', existsSync(path.join(linksDir, slug, String(up.json.file))));
  const saved = await call(
    'PUT',
    `/api/k/${slug}`,
    {
      items: [...picked, 'own:konobar'],
      own: [
        {
          id: 'konobar',
          question: { type: 'obicno', text: ownText, options: ['Bane', 'Žika'], correctIndex: 1, imageFile: up.json.file },
        },
      ],
      order: 'fixed',
      timeLimit: 10,
      speedBonus: false,
      maxPlayers: 4,
    },
    token
  );
  const savedLink = saved.json.link as { items: string[]; types: Record<string, number> } | undefined;
  check('čuvanje pitanja', saved.status === 200 && savedLink?.items.length === 4, saved.text);
  check('čuvanje: brojanje tipova', savedLink?.types.obicno === 4, JSON.stringify(savedLink?.types));
  const badOwn = await call(
    'PUT',
    `/api/k/${slug}`,
    { own: [{ id: 'x', question: { type: 'obicno', text: 'A?', options: ['samo jedna'], correctIndex: 0 } }] },
    token
  );
  check('čuvanje: neispravno sopstveno pitanje odbijeno', badOwn.status === 400);

  // --- Ulaz preko linka --------------------------------------------------------
  const connect = () => io(base, { transports: ['websocket'], forceNew: true }) as unknown as AnySocket;
  const enter = async (name: string) => {
    const s = connect();
    await once(s, 'connect');
    const view = {
      state: null as StateLite | null,
      ended: null as null | { finalScores: { playerId: string; score: number }[] },
      // Last "Tvoji odgovori" seen in this phone's private slice, plus every
      // player id that ever showed up in it (must be only our own).
      recap: null as null | { rank: number; correct: number; total: number; items: { a: string | null; ok: boolean | null; right?: string }[] },
      sliceIds: new Set<string>(),
    };
    s.on('game:player-state' as never, ((d: { playerData: Record<string, { linkRecap?: typeof view.recap }> }) => {
      for (const [id, slice] of Object.entries(d.playerData)) {
        view.sliceIds.add(id);
        if (slice.linkRecap) view.recap = slice.linkRecap;
      }
    }) as never);
    s.on('game:started' as never, ((d: { gameId: string; gameState: StateLite }) => {
      view.state = d.gameState;
      (view as { gameId?: string }).gameId = d.gameId;
    }) as never);
    s.on('game:state-update' as never, ((d: { gameState: StateLite }) => (view.state = d.gameState)) as never);
    s.on('game:ended' as never, ((d: typeof view.ended) => (view.ended = d)) as never);
    emit(s, 'player:join-kviz-link', { slug, playerName: name });
    const j = await once<{ player: { id: string }; room: { code: string; kvizLink?: { slug: string }; remoteHostPlayerId: string | null; settings: { maxPlayers: number } } }>(s, 'player:joined');
    return { s, view, id: j.player.id, room: j.room };
  };
  const ana = await enter('Ana');
  check('ulaz: soba nosi kviz link', ana.room.kvizLink?.slug === slug);
  check('ulaz: prvi igrač drži kontrolu', ana.room.remoteHostPlayerId === ana.id);
  check('ulaz: kapacitet iz linka', ana.room.settings.maxPlayers === 4);
  const bane = await enter('Bane');
  check('ulaz: drugi igrač u istom lobiju', bane.room.code === ana.room.code);
  const lobbyInfo = await call('GET', `/api/k/${slug}`);
  check('javno: lobi sa 2 igrača', (lobbyInfo.json.lobby as { playerCount?: number } | null)?.playerCount === 2);
  check('javna lista soba ne prikazuje link-sobu', !roomManager.listRoomSummaries().some((r) => r.code === ana.room.code));

  // --- Partija -------------------------------------------------------------------
  emit(ana.s, 'host:start-game', { gameId: 'draw-guess' });
  await until('partija: počela', () => !!ana.view.state);
  check('partija: link-soba igra samo kviz', (ana.view as { gameId?: string }).gameId === 'quiz');
  const answered = new Set<number>();
  const texts: string[] = [];
  await until(
    'partija: sva 4 pitanja odigrana',
    () => {
      const st = ana.view.state;
      if (st?.data.phase === 'answering') {
        const i = st.data.questionIndex as number;
        if (!answered.has(i)) {
          answered.add(i);
          texts[i] = String(st.data.questionText);
          const own = st.data.questionText === ownText;
          emit(ana.s, 'game:player-action', { action: 'quiz:answer', data: { optionIndex: 0 } });
          emit(bane.s, 'game:player-action', { action: 'quiz:answer', data: { optionIndex: own ? 1 : 0 } });
        }
      }
      return !!ana.view.ended;
    },
    40000
  );
  check('partija: 4 pitanja, sopstveno poslednje (fiksan redosled)', texts.length === 4 && texts[3] === ownText, JSON.stringify(texts));
  const scores = ana.view.ended?.finalScores ?? [];
  check(
    'partija: bez brzinskog bonusa poeni su celi hiljaditi',
    scores.length === 2 && scores.every((s) => s.score % 1000 === 0),
    JSON.stringify(scores)
  );
  const baneScore = scores.find((s) => s.playerId === bane.id)?.score ?? 0;
  check('partija: Bane osvojio 1000 na sopstvenom pitanju', baneScore >= 1000, String(baneScore));

  await sleep(300);
  const stats = await call('GET', `/api/k/${slug}/stats`, undefined, token);
  const games = (stats.json.games ?? []) as {
    questions: { key: string; options?: string[]; correct?: unknown }[];
    players: { name: string; results: (0 | 1 | null)[]; answers?: unknown[]; ms?: (number | null)[] }[];
  }[];
  check('statistika: jedna partija', games.length === 1, stats.text.slice(0, 200));
  check('statistika: 4 pitanja sa ključevima', games[0]?.questions.map((q) => q.key).join(',') === [...picked, 'own:konobar'].join(','));
  const sb = games[0]?.players.find((p) => p.name === 'Bane');
  const sa = games[0]?.players.find((p) => p.name === 'Ana');
  check('statistika: Bane tačno na sopstvenom', sb?.results[3] === 1, JSON.stringify(sb));
  check('statistika: Ana netačno na sopstvenom', sa?.results[3] === 0, JSON.stringify(sa));
  check('statistika: Anin odgovor zapamćen', JSON.stringify(sa?.answers?.[3]) === JSON.stringify({ k: 'opt', i: 0 }), JSON.stringify(sa?.answers));
  check('statistika: vreme odgovora', typeof sa?.ms?.[3] === 'number' && sa.ms[3]! >= 0, JSON.stringify(sa?.ms));
  const ownSnap = games[0]?.questions[3];
  check(
    'statistika: snimak sopstvenog pitanja',
    JSON.stringify(ownSnap?.options) === JSON.stringify(['Bane', 'Žika']) && ownSnap?.correct === 1,
    JSON.stringify(ownSnap)
  );
  check(
    'tvoji odgovori: Ana dobila svoja 4 odgovora',
    ana.view.recap?.total === 4 && ana.view.recap.items[3].a === 'Bane' && ana.view.recap.items[3].ok === false && ana.view.recap.items[3].right === 'Žika',
    JSON.stringify(ana.view.recap)
  );
  check('tvoji odgovori: Bane tačno na sopstvenom', bane.view.recap?.items[3].ok === true, JSON.stringify(bane.view.recap));
  check(
    'tvoji odgovori: telefon vidi samo svoj deo',
    [...ana.view.sliceIds].every((id) => id === ana.id) && [...bane.view.sliceIds].every((id) => id === bane.id),
    [...ana.view.sliceIds].join(',') + ' / ' + [...bane.view.sliceIds].join(',')
  );
  const manage = await call('GET', `/api/k/${slug}/manage`, undefined, token);
  check('upravljanje: zbir igrača', (manage.json.stats as { players?: number })?.players === 2);

  // --- PIN za ulaz ------------------------------------------------------------------
  const setJoin = await call('PUT', `/api/k/${slug}`, { joinPin: '2468' }, token);
  check('PIN za ulaz: sačuvan', setJoin.status === 200 && (setJoin.json.link as { joinPin?: string }).joinPin === '2468');
  check('PIN za ulaz: ne ide u javnu karticu', !(await call('GET', `/api/k/${slug}`)).text.includes('2468'));
  check('PIN za ulaz: kartica kaže da je potreban', ((await call('GET', `/api/k/${slug}`)).json.link as { joinPinRequired?: boolean }).joinPinRequired === true);
  check('PIN za ulaz: loš format odbijen', (await call('PUT', `/api/k/${slug}`, { joinPin: '12' }, token)).status === 400);
  const tryJoin = async (name: string, joinPin?: string) => {
    const s = connect();
    await once(s, 'connect');
    emit(s, 'player:join-kviz-link', { slug, playerName: name, joinPin });
    const r = await Promise.race([
      once<{ room: { code: string } }>(s, 'player:joined').then((j) => ({ ok: true as const, code: j.room.code })),
      once<{ message: string }>(s, 'error').then((e) => ({ ok: false as const, message: e.message })),
    ]);
    return { s, r };
  };
  const noPin = await tryJoin('Dejan');
  check('PIN za ulaz: bez PIN-a odbijen', !noPin.r.ok, JSON.stringify(noPin.r));
  const wrongPin = await tryJoin('Dejan', '1111');
  check('PIN za ulaz: pogrešan odbijen', !wrongPin.r.ok && /Pogrešan/.test(wrongPin.r.message), JSON.stringify(wrongPin.r));
  const byCode = connect();
  await once(byCode, 'connect');
  emit(byCode, 'player:join-room', { roomCode: ana.room.code, playerName: 'Dejan' });
  const codeErr = await once<{ message: string }>(byCode, 'error').catch(() => null);
  check('PIN za ulaz: kod sobe ne zaobilazi PIN', !!codeErr && /PIN/.test(codeErr.message), JSON.stringify(codeErr));
  const goodPin = await tryJoin('Dejan', '2468');
  check('PIN za ulaz: tačan pušta u isti lobi', goodPin.r.ok && goodPin.r.code === ana.room.code, JSON.stringify(goodPin.r));
  for (const x of [noPin.s, wrongPin.s, byCode, goodPin.s]) x.disconnect();
  await call('PUT', `/api/k/${slug}`, { joinPin: '' }, token);
  check('PIN za ulaz: uklonjen', !((await call('GET', `/api/k/${slug}`)).json.link as { joinPinRequired?: boolean }).joinPinRequired);

  // --- Istek -----------------------------------------------------------------------
  await call('PUT', `/api/k/${slug}`, { validFrom: now - 7200_000, expiresAt: now - 60_000 }, token);
  emit(ana.s, 'host:start-game', { gameId: 'quiz' });
  const startErr = await once<{ code: string; message: string }>(ana.s, 'error').catch(() => null);
  check('istek: nova partija ne može da počne', startErr?.code === 'START_ERROR', JSON.stringify(startErr));
  const late = connect();
  await once(late, 'connect');
  emit(late, 'player:join-kviz-link', { slug, playerName: 'Ceca' });
  const lateErr = await once<{ code: string; message: string }>(late, 'error').catch(() => null);
  check('istek: ulaz preko linka odbijen', lateErr?.code === 'JOIN_ERROR', JSON.stringify(lateErr));
  const expired = await call('GET', `/api/k/${slug}`);
  check(
    'istek: javna kartica pokazuje rezultate',
    expired.json.status === 'expired' && Array.isArray(expired.json.results) && (expired.json.results as unknown[]).length === 2
  );

  // --- Admin --------------------------------------------------------------------
  check('admin: bez tokena 403/401', (await call('GET', '/api/admin/kviz-links')).status >= 401);
  const adminList = await call('GET', '/api/admin/kviz-links', undefined, undefined, true);
  const row = ((adminList.json.links ?? []) as { slug: string; games: number; players: number }[]).find((l) => l.slug === slug);
  check('admin: lista sa partijama i igračima', row?.games === 1 && row?.players === 2, adminList.text.slice(0, 200));
  const adminTok = await call('POST', `/api/admin/kviz-links/${slug}/token`, undefined, undefined, true);
  check('admin: token za uređivanje važi', (await call('GET', `/api/k/${slug}/manage`, undefined, String(adminTok.json.token))).status === 200);
  await call('POST', '/api/k', { ...createBody, slug: 'za-brisanje' });
  check('admin: brisanje', (await call('DELETE', '/api/admin/kviz-links/za-brisanje', undefined, undefined, true)).status === 200);
  check('admin: obrisan link nestaje', (await call('GET', '/api/k/za-brisanje')).status === 404);

  // --- PIN i brisanje -----------------------------------------------------------------
  const newPin = await call('POST', `/api/k/${slug}/pin`, { pin: '1234' }, token);
  check('novi PIN: novi token', newPin.status === 200 && newPin.json.token !== token);
  check('novi PIN: stari token više ne važi', (await call('GET', `/api/k/${slug}/manage`, undefined, token)).status === 401);
  token = newPin.json.token as string;
  check('brisanje', (await call('DELETE', `/api/k/${slug}`, undefined, token)).status === 200);
  check('brisanje: link više ne postoji', (await call('GET', `/api/k/${slug}`)).status === 404);
  check('brisanje: folder obrisan', !readdirSync(linksDir).includes(slug));

  for (const s of [ana.s, bane.s, late]) s.disconnect();
  httpServer.close();
  console.log(failures.length ? `\n✗ ${failures.length} neuspelih provera` : '\n✓ sve provere prošle');
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
