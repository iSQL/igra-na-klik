import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BitkaAnswerResult, BitkaHostData, BitkaPlayerView } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { BitkaMapView } from './components/BitkaMapView';
import {
  BITKA_NAJAVA_MS,
  BITKA_ZAMAK_BODOVI,
  deriveFxEvents,
  planFxHolds,
  territoryValue,
  type BitkaFxEvent,
  type BitkaFxSnapshot,
  type BitkaTerritoryState,
} from '@igra/shared';

// three.js ulazi tek ovde i to u zasebnom chunk-u: mapa se vidi odmah, teren i
// efekti se priključe kad se učita. Telefon ove module nikad ne dohvata.
const BitkaFx = lazy(() => import('./fx/BitkaFx'));
const BitkaBoard3D = lazy(() => import('./fx/BitkaBoard3D'));

/**
 * TV podrazumevano crta 3D teren. `?board=2d` u adresi hosta vraća ravnu mapu
 * sa providnim FX slojem — ista igra, jeftiniji prikaz, i način da se dva
 * izgleda uporede na istom televizoru.
 */
function prefers2DBoard(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('board') === '2d';
}

const PANEL_IN = { opacity: 0, y: 26 };
const PANEL_AT = { opacity: 1, y: 0 };
const PANEL_OUT = { opacity: 0, y: -18 };

/** Naslov faze na TV-u — igrači gledaju mapu, ovo im kaže šta se traži. */
const PHASE_TITLE: Record<string, string> = {
  uvod: 'Bitka počinje',
  'redosled-pitanje': 'Ko bira prvi?',
  'redosled-odgovor': 'Ko bira prvi?',
  'redosled-rezultat': 'Redosled je određen',
  'baza-izbor': 'Podignite zamkove',
  'osvajanje-pitanje': 'Osvajanje zemlje',
  'osvajanje-odgovor': 'Osvajanje zemlje',
  'osvajanje-rezultat': 'Tačan odgovor',
  'osvajanje-izbor': 'Biranje teritorije',
  'napad-izbor': 'Izbor mete',
  'duel-pitanje': 'Duel',
  'duel-odgovor': 'Duel',
  'duel-broj': 'Nerešeno — broj odlučuje',
  'duel-rezultat': 'Ishod napada',
  rezultat: 'Kraj bitke',
  ended: 'Kraj bitke',
};

export default function BitkaHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevEventRef = useRef<string | null>(null);
  const prevSecRef = useRef<number>(0);

  const host = gameState?.data.host as BitkaHostData | undefined;
  const phase = gameState?.phase;

  // Zvuk se vezuje za PROMENU faze, ne za render: gameState je nov objekat na
  // svaki tick, pa bi inače zvonio jednom u sekundi.
  useEffect(() => {
    if (!phase) return;
    if (prevPhaseRef.current !== phase) {
      prevPhaseRef.current = phase;
      if (phase === 'osvajanje-rezultat' || phase === 'redosled-rezultat') play('reveal');
      if (phase === 'baza-izbor' || phase === 'napad-izbor') play('join');
      if (phase === 'rezultat') play('victory');
    }
  }, [phase, play]);

  // Ishod napada ima svoj zvuk, ali samo jednom po duelu.
  useEffect(() => {
    const outcome = host?.duel?.outcome;
    if (phase !== 'duel-rezultat' || !outcome) return;
    const key = `${host?.duel?.territoryId}:${outcome}`;
    if (prevEventRef.current === key) return;
    prevEventRef.current = key;
    if (outcome === 'zamak-pao') play('victory');
    else if (outcome === 'branilac') play('wrong');
    else play('correct');
  }, [phase, host, play]);

  // Vizuelni događaji se izvode iz RAZLIKE dva uzastopna stanja, pa se svaki
  // odigra tačno jednom — isti princip kao zvuk iznad, samo generalizovan.
  const [fxEvents, setFxEvents] = useState<BitkaFxEvent[]>([]);
  /**
   * Tabla koju crta mapa — zasebno stanje, ne `host.board`. Bez ovoga bi boja
   * pretekla bljesak: stanje sa servera stiže odmah, efekat kasni koliko
   * projektil leti, a `useEffect` radi tek posle iscrtavanja.
   */
  const [shownBoard, setShownBoard] = useState<BitkaTerritoryState[]>([]);
  const prevSnapRef = useRef<BitkaFxSnapshot | null>(null);
  const liveBoardRef = useRef<BitkaTerritoryState[]>([]);
  const fxIdRef = useRef(0);
  const holdTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [use3D, setUse3D] = useState(() => !prefers2DBoard());
  const drop3D = useCallback(() => setUse3D(false), []);
  useEffect(() => () => holdTimersRef.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!host || !phase) return;
    liveBoardRef.current = host.board;
    const snapshot: BitkaFxSnapshot = { phase, host };
    const prevBoard = prevSnapRef.current?.host.board;
    const events = deriveFxEvents(prevSnapRef.current, snapshot, () => ++fxIdRef.current);
    prevSnapRef.current = snapshot;

    const holds = events.length > 0 ? planFxHolds(prevBoard, events) : [];
    const heldNow = new Map(holds.map((h) => [h.territoryId, h.state]));
    setShownBoard(host.board.map((st) => heldNow.get(st.id) ?? st));
    if (!events.length) return;
    setFxEvents(events);

    for (const h of holds) {
      holdTimersRef.current.push(
        setTimeout(() => {
          setShownBoard((prev) =>
            prev.map((st) =>
              st.id === h.territoryId
                ? (liveBoardRef.current.find((b) => b.id === h.territoryId) ?? st)
                : st
            )
          );
        }, h.delay * 1000)
      );
    }
  }, [host, phase]);

  // Odbrojavanje u poslednjih 5 sekundi aktivnih faza.
  useEffect(() => {
    if (!gameState) return;
    const answering =
      phase === 'redosled-odgovor' ||
      phase === 'osvajanje-odgovor' ||
      phase === 'duel-odgovor' ||
      phase === 'duel-broj' ||
      phase === 'baza-izbor' ||
      phase === 'napad-izbor' ||
      phase === 'osvajanje-izbor';
    const sec = Math.ceil(gameState.timeRemaining);
    if (answering && sec !== prevSecRef.current && sec <= 5 && sec > 0) play('tick');
    prevSecRef.current = sec;
  }, [gameState, phase, play]);

  // Najava napada: kratka kartica preko table na ulasku u duel, da se pre
  // pitanja vidi ko koga napada i za šta. Vezuje se za DUEL a ne za render —
  // `gameState` je nov objekat svake sekunde, pa bi se inače vraćala u petlji.
  const duelKey =
    phase === 'duel-pitanje' && host?.duel
      ? `${host.duel.attackerId}:${host.duel.territoryId}`
      : '';
  const [najava, setNajava] = useState(false);
  useEffect(() => {
    if (!duelKey) {
      setNajava(false);
      return;
    }
    setNajava(true);
    play('reveal');
    const timer = setTimeout(() => setNajava(false), BITKA_NAJAVA_MS);
    return () => clearTimeout(timer);
  }, [duelKey, play]);

  if (!gameState || !host) return null;
  // Naslovi i tabela poena idu po pravom stanju; kasni samo mapa.
  const displayBoard = shownBoard.length > 0 ? shownBoard : host.board;

  if (phase === 'rezultat' || phase === 'ended') {
    return (
      <FinalBoard
        host={host}
        board={displayBoard}
        fxEvents={fxEvents}
        use3D={use3D}
        onFail={drop3D}
      />
    );
  }

  const seconds = Math.ceil(gameState.timeRemaining);
  /**
   * Duel dobija svoj raspored ekrana: pitanje je glavno, mapa je pratnja.
   *
   * U ostalim fazama je obrnuto (mapa preko celog ekrana, pitanje u uskoj
   * traci ispod), ali u duelu se dvoje bore na tajmer — sa fotelje se mora
   * čitati pitanje, videti ko je zaključao odgovor i koliko je ostalo.
   */
  const duelArena = (phase === 'duel-odgovor' || phase === 'duel-broj') && !!host.duel;
  const showClock =
    phase === 'redosled-odgovor' ||
    phase === 'osvajanje-odgovor' ||
    phase === 'duel-odgovor' ||
    phase === 'duel-broj' ||
    phase === 'baza-izbor' ||
    phase === 'osvajanje-izbor' ||
    phase === 'napad-izbor';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        // Hrom je stisnut da bi tabla dobila visinu — na TV-u se gleda mapa,
        // a naslov i tabela poena su pratnja.
        gap: '0.55rem',
        padding: '0.6rem 1rem 0.7rem',
        boxSizing: 'border-box',
        overflow: 'hidden',
        // Najava napada leži preko cele table, pa joj treba sidro.
        position: 'relative',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          // Domaćinovo dugme „Završi igru" stoji u gornjem desnom uglu ekrana,
          // pa sat mora da mu se skloni — inače se krupno odbrojavanje u duelu
          // crta tačno ispod njega.
          paddingRight: showClock ? '8.5rem' : 0,
        }}
      >
        {/* Opsada je jedini napad koji može da ubije igrača — zato se najavljuje
            i u zaglavlju, a ne samo u kartici koja prođe za sekundu i po. */}
        {phase?.startsWith('duel') && host.duel?.onCastle && (
          <span
            className="bitka-siege"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.3rem 0.9rem',
              borderRadius: '999px',
              background: 'rgba(224,106,94,0.18)',
              border: '1px solid var(--danger)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontSize: '0.85rem',
              color: '#f0b3ab',
            }}
          >
            🏰 Opsada zamka
          </span>
        )}
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '1.6rem',
            color: 'var(--text-primary)',
          }}
        >
          {PHASE_TITLE[phase ?? ''] ?? 'KvizAtar'}
        </h1>
        <span style={{ color: 'var(--dim)', fontSize: '1rem' }}>
          {host.round > 0
            ? `Rat · runda ${host.round}${
                host.mode === 'runde' ? `/${host.totalRounds}` : ''
              } · zamkova još ${host.players.filter((p) => p.walls > 0).length}`
            : host.osvajanjeRound
              ? `Osvajanje zemlje · ${host.osvajanjeRound}. pitanje`
              : host.map.name}
        </span>
        <span style={{ flex: 1 }} />
        {showClock && (
          <span
            // Duel je jedini trenutak kad cela soba gleda u sat — tada je
            // krupniji i kuca.
            className={duelArena && seconds <= 10 ? 'bitka-tick' : undefined}
            style={{
              padding: '0.3rem 1.1rem',
              borderRadius: '999px',
              background: seconds <= 5 ? 'rgba(224,106,94,0.22)' : 'var(--bg-card)',
              border: `1px solid ${seconds <= 5 ? 'var(--danger)' : 'var(--line2)'}`,
              fontWeight: 800,
              fontSize: duelArena ? '2.4rem' : '1.3rem',
              color: seconds <= 5 ? 'var(--danger)' : 'var(--text-primary)',
              minWidth: duelArena ? '4.4rem' : '3.2rem',
              textAlign: 'center',
              lineHeight: 1.1,
            }}
          >
            {seconds}
          </span>
        )}
      </header>

      {/*
        Jedan te isti raspored za sve faze — menjaju se samo širine kolona i
        sadržaj desne. NAMERNO nije ternar sa dva različita podstabla: tada bi
        React na svakoj promeni faze duela odmontirao i ponovo napravio 3D
        tablu (nova scena, nova geometrija, kamera iz početka), a uz to bi se
        `BitkaBoard3D`-u resetovao brojač odigranih efekata pa bi se poslednji
        udar ponovio na svaki povratak.
      */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: duelArena ? '420px minmax(0, 1fr)' : 'minmax(0, 1fr) 250px',
          gap: '0.9rem',
          // `stretch`, ne `center`: tabla tako dobija tačno visinu svog reda i
          // ne može da se prelije preko donje trake sa pitanjem.
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: '1 1 auto', minHeight: duelArena ? '9rem' : 0, display: 'flex' }}>
            <BoardSurface
              host={host}
              board={displayBoard}
              fxEvents={fxEvents}
              use3D={use3D}
              onFail={drop3D}
              highlightIds={host.selectableIds}
              focusId={host.duel?.territoryId ?? null}
              // U duelu tabla prati napadača; van njega onoga ko je na potezu.
              activePlayerId={
                (duelArena ? host.duel?.attackerId : host.activePlayerId) ?? null
              }
              // 3D teren uzima ceo red; ravna mapa ostaje ograničena po visini,
              // jer joj je odnos stranica zaključan pa ne sme da preraste red.
              fillHeight
              maxHeightCss={duelArena ? '34vh' : '76vh'}
            />
          </div>
          {duelArena && (
            <>
              <TargetCard host={host} />
              <div style={{ flexShrink: 0 }}>
                <Standings players={host.players} activeId={host.duel?.attackerId ?? null} compact />
              </div>
            </>
          )}
        </div>

        {duelArena ? (
          <DuelArena host={host} phase={phase ?? ''} />
        ) : (
          <div style={{ alignSelf: 'center' }}>
            <Standings players={host.players} activeId={host.activePlayerId ?? null} />
          </div>
        )}
      </div>

      {/* U duelu pitanje stoji u svojoj koloni, pa donja traka nema šta da nosi. */}
      {!duelArena && (
        <AnimatePresence mode="wait">
          <motion.div
            key={panelKey(host, phase ?? '')}
            initial={PANEL_IN}
            animate={PANEL_AT}
            exit={PANEL_OUT}
            transition={{ duration: 0.22 }}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--line)',
              borderRadius: '16px',
              padding: '0.7rem 1.1rem',
              minHeight: '4.4rem',
              display: 'flex',
              alignItems: 'center',
              // Pitanje se čita — ništa sa table ne sme da mu se popne preko.
              position: 'relative',
              zIndex: 2,
              flexShrink: 0,
            }}
          >
            <Panel host={host} phase={phase ?? ''} />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Najava napada — pokriva sve iznad, pa ide poslednja. */}
      <AnimatePresence>
        {najava && host.duel && <DuelNajava host={host} />}
      </AnimatePresence>
    </div>
  );
}

/** Ključ panela — menja se kad se promeni ono što panel prikazuje. */
function panelKey(host: BitkaHostData, phase: string): string {
  if (phase.startsWith('duel')) return `${phase}:${host.duel?.territoryId ?? ''}`;
  if (phase.startsWith('osvajanje')) return `${phase}:${host.osvajanjeRound ?? 0}:${host.activePlayerId ?? ''}`;
  if (phase === 'napad-izbor') return `${phase}:${host.activePlayerId ?? ''}`;
  return phase;
}

// --- Delovi -----------------------------------------------------------------

function Panel({ host, phase }: { host: BitkaHostData; phase: string }) {
  const named = (id: string | null | undefined) =>
    host.players.find((p) => p.playerId === id)?.name ?? 'Igrač';

  // Svaki ekran duela nosi istu traku „ko napada koga i za šta" — bez nje se
  // sa TV-a ne vidi ko je u dvoboju, a kladi se cela soba.
  if (phase.startsWith('duel') && host.duel) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
        <DuelHeader host={host} />
        {/* I u ishodu ostaje pitanje na ekranu: tu se vidi ko je šta izabrao i
            šta je bilo tačno. Bez toga se sa TV-a zna samo ko je uzeo zemlju,
            a nikad zašto — najviše kod nerešenog duela, gde je presudio broj. */}
        {host.question && <QuestionPanel host={host} phase={phase} />}
        {phase === 'duel-rezultat' && host.tiebreak && <TiebreakStrip host={host} />}
        {phase === 'duel-rezultat' && <DuelOutcome host={host} />}
      </div>
    );
  }

  if (phase === 'uvod') {
    return (
      <Line
        title={host.map.name}
        text="Svako bira svoj zamak, pa se kroz pitanja osvaja zemlja. Ko sruši tri zida tuđeg zamka — uzima sve."
      />
    );
  }

  if (phase === 'baza-izbor') {
    const done = new Set(host.baseCommittedIds ?? []);
    const queue = (host.pickQueue ?? []).slice(1);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', width: '100%' }}>
        <Line
          title={`${named(host.activePlayerId)} bira mesto za zamak`}
          text={
            queue.length > 0
              ? `Na redu posle: ${queue.map(named).join(', ')} — vide gde su zamkovi već podignuti.`
              : 'Poslednji zamak.'
          }
        />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {host.players.map((p) => (
            <Chip
              key={p.playerId}
              player={p}
              dim={!done.has(p.playerId) && p.playerId !== host.activePlayerId}
              label={
                done.has(p.playerId)
                  ? 'utvrđen'
                  : p.playerId === host.activePlayerId
                    ? 'bira…'
                    : 'čeka'
              }
            />
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'osvajanje-izbor') {
    // Čist ekran: pitanje i tačan odgovor su odgledani u prethodnoj fazi.
    return (
      <Line
        title={`${named(host.activePlayerId)} bira slobodnu teritoriju`}
        text={
          (host.pickQueue?.length ?? 0) > 1
            ? `Na redu posle: ${(host.pickQueue ?? []).slice(1).map(named).join(', ')}`
            : 'Poslednji izbor u ovoj rundi.'
        }
      />
    );
  }

  if (phase === 'napad-izbor') {
    return (
      <Line
        title={`${named(host.activePlayerId)} bira metu`}
        text="Napada se susedna tuđa ili ničija teritorija."
      />
    );
  }

  // Uvodni broj se otkriva kao i svako drugo pitanje, ali ovde otkrivanje nosi
  // i posledicu — ko prvi bira zamak — pa ta rečenica ostaje ispod njega.
  if (phase === 'redosled-rezultat' && host.question) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
        <QuestionPanel host={host} phase={phase} />
        {host.lastEvent && <Line title={host.lastEvent} text="" />}
      </div>
    );
  }

  if (host.question) {
    return <QuestionPanel host={host} phase={phase} />;
  }

  return <Line title={host.lastEvent ?? '—'} text="" />;
}

/**
 * Najava napada — kartica koja na sekundu i po pokrije tablu čim duel počne.
 *
 * Dotad se napad video tek iz uske trake ispod mape, u istom trenutku kad i
 * pitanje, pa je soba čitala pitanje umesto da vidi ko je kome krenuo na
 * zemlju. Ovo je jedini ekran u igri koji svesno sakrije mapu: traje kratko,
 * ne dodaje vreme partiji (jede prvi deo pauze za čitanje pitanja) i posle
 * njega ostaje isti duel ekran.
 */
function DuelNajava({ host }: { host: BitkaHostData }) {
  const duel = host.duel!;
  const attacker = host.players.find((p) => p.playerId === duel.attackerId);
  const defender = host.players.find((p) => p.playerId === duel.defenderId);
  const territory = host.map.territories.find((t) => t.id === duel.territoryId);
  const st = host.board.find((x) => x.id === duel.territoryId);
  const walls = st?.walls ?? 0;
  const value = st?.castle ? BITKA_ZAMAK_BODOVI : territoryValue(territory ?? {});

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        display: 'grid',
        placeItems: 'center',
        // Tabla ostaje da se vidi ispod — najava je nadgradnja nad njom, a ne
        // zaseban ekran. Zato zatamnjenje, a NE `backdrop-filter`: ispod je
        // WebGL platno, čiji sadržaj u toj snimci ume da ispadne crn, pa bi se
        // umesto pritamnjene table videla crna rupa.
        background: 'rgba(9,20,36,0.58)',
        pointerEvents: 'none',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 380, damping: 24 }}
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.4rem',
          padding: '2.4rem 3.6rem',
          borderRadius: '24px',
          background: 'var(--bg-card)',
          border: '1px solid rgba(242,206,116,0.55)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <span className="bitka-sheen" />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            fontSize: '1rem',
            color: '#F2CE74',
          }}
        >
          {duel.onCastle ? 'Opsada zamka' : defender ? 'Napad' : 'Pohod na ničiju zemlju'}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.6rem' }}>
          <NajavaSide player={attacker} role="napada" />
          <span style={{ fontSize: '2.6rem', filter: 'drop-shadow(0 0 18px rgba(242,206,116,0.7))' }}>
            ⚔️
          </span>
          {defender ? (
            <NajavaSide player={defender} role={duel.onCastle ? 'brani zamak' : 'brani'} mirrored />
          ) : (
            <span style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--dim)' }}>
              ničija zemlja
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.8rem',
            padding: '0.5rem 1.2rem',
            borderRadius: '999px',
            background: 'rgba(242,206,116,0.14)',
            border: '1px solid rgba(242,206,116,0.4)',
          }}
        >
          <span style={{ fontSize: '1.3rem' }}>{st?.castle ? '🏰' : '🚩'}</span>
          <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#F2CE74' }}>
            {territory?.name ?? ''}
          </span>
          {duel.onCastle && <Walls walls={walls} size={12} />}
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            · {value} poena
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NajavaSide({
  player,
  role,
  mirrored,
}: {
  player?: BitkaPlayerView;
  role: string;
  /** Branilac stoji desno od mačeva, pa mu ime beži ka ivici kartice. */
  mirrored?: boolean;
}) {
  if (!player) return null;
  const face = (
    <span
      style={{
        width: '3.4rem',
        height: '3.4rem',
        borderRadius: '50%',
        background: player.avatarColor,
        display: 'grid',
        placeItems: 'center',
        fontSize: '1.8rem',
        flexShrink: 0,
      }}
    >
      {player.avatarEmoji}
    </span>
  );
  const text = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: mirrored ? 'flex-end' : 'flex-start',
      }}
    >
      <span style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--text-primary)' }}>
        {player.name}
      </span>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{role}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
      {mirrored ? (
        <>
          {text}
          {face}
        </>
      ) : (
        <>
          {face}
          {text}
        </>
      )}
    </div>
  );
}

/** Za šta se bije duel — teritorija, njena vrednost i stanje zidova. */
function TargetCard({ host }: { host: BitkaHostData }) {
  const duel = host.duel!;
  const territory = host.map.territories.find((t) => t.id === duel.territoryId);
  const st = host.board.find((x) => x.id === duel.territoryId);
  const walls = st?.walls ?? 0;
  const value = st?.castle ? BITKA_ZAMAK_BODOVI : territoryValue(territory ?? {});
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        padding: '0.7rem 0.8rem',
        borderRadius: '14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--line)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.2rem' }}>{st?.castle ? '🏰' : '🚩'}</span>
        <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#F2CE74' }}>
          {territory?.name ?? ''}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>{value} poena</span>
      </div>
      {duel.onCastle && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
          }}
        >
          <span>zidovi</span>
          <Walls walls={walls} size={14} />
          <span style={{ marginLeft: 'auto' }}>još {walls} od 3</span>
        </div>
      )}
    </div>
  );
}

/**
 * Duel ekran — pitanje krupno, uz njega ko je zaključao odgovor.
 *
 * Zaključavanje ide isključivo iz `attackerCommitted` / `defenderCommitted`,
 * dve zastavice koje server šalje baš zato što se ŠTA je ko izabrao ne sme
 * naći u broadcast-u. Ovde se, dakle, vidi da je odgovor stigao — nikad koji.
 */
function DuelArena({ host, phase }: { host: BitkaHostData; phase: string }) {
  const duel = host.duel!;
  const q = host.question;
  const attacker = host.players.find((p) => p.playerId === duel.attackerId);
  const defender = host.players.find((p) => p.playerId === duel.defenderId);
  // Svi koji ne odgovaraju gledaju isto pitanje na telefonu — TV to kaže
  // naglas, da niko ne čeka svoj red misleći da mu je ekran zaglavio.
  const watching = host.players.filter(
    (p) => !p.eliminated && !(host.expectedIds ?? []).includes(p.playerId)
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem',
        minHeight: 0,
        padding: '1.1rem 1.3rem',
        borderRadius: '18px',
        background: 'var(--bg-card)',
        border: '1px solid rgba(242,206,116,0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
        <DuelSlot player={attacker} role="napada" committed={duel.attackerCommitted} />
        <span style={{ fontSize: '1.6rem' }}>⚔️</span>
        {defender ? (
          <DuelSlot
            player={defender}
            role={duel.onCastle ? 'brani zamak' : 'brani'}
            committed={duel.defenderCommitted}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.5rem 0.8rem',
              borderRadius: '12px',
              border: '1px dashed var(--line2)',
              color: 'var(--dim)',
              fontWeight: 800,
            }}
          >
            <span style={{ fontSize: '1.4rem' }}>🚩</span>
            <span>ničija zemlja</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', fontWeight: 700 }}>
              niko ne brani
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.1rem',
          justifyContent: 'center',
        }}
      >
        {q ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
              <QuestionImage url={q.imageUrl} height="7rem" />
              <div
                style={{
                  fontSize: '2.3rem',
                  fontWeight: 800,
                  lineHeight: 1.25,
                  color: 'var(--text-primary)',
                }}
              >
                {q.text}
              </div>
            </div>
            {q.kind === 'izbor' && q.options && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                {q.options.map((o) => (
                  <span
                    key={o.index}
                    style={{
                      padding: '0.8rem 1rem',
                      borderRadius: '12px',
                      background: o.color,
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '1.3rem',
                    }}
                  >
                    {o.text}
                  </span>
                ))}
              </div>
            )}
            {q.kind === 'broj' && (
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Procenjuje se broj — opseg {q.min}–{q.max}
                {q.unit ? ` ${q.unit}` : ''}. Bliži uzima zemlju.
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--dim)' }}>
            {phase === 'duel-broj' ? 'Nerešeno — broj odlučuje' : 'Pitanje stiže…'}
          </div>
        )}
      </div>

      {watching.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            paddingTop: '0.6rem',
            borderTop: '1px solid var(--line)',
            color: 'var(--dim)',
            fontSize: '0.95rem',
          }}
        >
          {watching.map((p) => (
            <span
              key={p.playerId}
              style={{
                width: '1.7rem',
                height: '1.7rem',
                borderRadius: '50%',
                background: p.avatarColor,
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.9rem',
                flexShrink: 0,
              }}
            >
              {p.avatarEmoji}
            </span>
          ))}
          <span>
            {watching.map((p) => p.name).join(', ')}{' '}
            {watching.length === 1 ? 'gleda' : 'gledaju'} — isto pitanje je i na telefonu, bez
            dugmadi.
          </span>
        </div>
      )}
    </div>
  );
}

/** Jedna strana duela sa stanjem odgovora — „zaključao ✓" ili „razmišlja…". */
function DuelSlot({
  player,
  role,
  committed,
}: {
  player?: BitkaPlayerView;
  role: string;
  committed: boolean;
}) {
  if (!player) return null;
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.5rem 0.8rem',
        borderRadius: '12px',
        background: committed ? 'rgba(87,179,128,0.16)' : 'rgba(245,235,224,0.06)',
        border: committed ? '1px solid var(--success)' : '1px dashed var(--line2)',
        transition: 'background 0.25s, border-color 0.25s',
      }}
    >
      <span
        style={{
          width: '2.4rem',
          height: '2.4rem',
          borderRadius: '50%',
          background: player.avatarColor,
          display: 'grid',
          placeItems: 'center',
          fontSize: '1.2rem',
          flexShrink: 0,
        }}
      >
        {player.avatarEmoji}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
          {player.name}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--dim)' }}>{role}</span>
      </div>
      <span
        style={{
          marginLeft: 'auto',
          fontWeight: 800,
          color: committed ? 'var(--success)' : 'var(--text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        {committed ? 'zaključao ✓' : 'razmišlja…'}
      </span>
    </div>
  );
}

function QuestionPanel({ host, phase }: { host: BitkaHostData; phase: string }) {
  const q = host.question!;
  const answered = new Set(host.answeredIds ?? []);
  const revealing = phase.endsWith('-rezultat');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', width: '100%' }}>
      <QuestionImage url={q.imageUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{q.text}</div>
        {q.kind === 'izbor' && q.options && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {q.options.map((o) => {
              const right = revealing && host.correctIndex === o.index;
              // Ko je izabrao baš ovaj odgovor — avatari sede na samoj opciji,
              // pa se ceo ishod pitanja čita sa jednog mesta.
              const takers = revealing
                ? (host.results ?? [])
                    .filter((r) => r.optionIndex === o.index)
                    .map((r) => host.players.find((p) => p.playerId === r.playerId))
                    .filter((p): p is BitkaPlayerView => !!p)
                : [];
              return (
                <span
                  key={o.index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.3rem 0.8rem',
                    borderRadius: '10px',
                    background: right ? 'var(--success)' : o.color,
                    border: right ? '2px solid #fff' : '2px solid transparent',
                    opacity: revealing && !right ? 0.35 : 1,
                    color: '#fff',
                    fontWeight: 700,
                    transition: 'opacity 0.25s',
                  }}
                >
                  {right && <span>✓</span>}
                  <span>{o.text}</span>
                  {takers.map((p) => (
                    <span
                      key={p.playerId}
                      style={{
                        width: '1.7rem',
                        height: '1.7rem',
                        borderRadius: '50%',
                        background: p.avatarColor,
                        border: '2px solid rgba(0,0,0,0.35)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '0.9rem',
                      }}
                    >
                      {p.avatarEmoji}
                    </span>
                  ))}
                </span>
              );
            })}
          </div>
        )}
        {q.kind === 'broj' && (
          <div style={{ marginTop: '0.4rem', color: 'var(--text-secondary)' }}>
            Opseg {q.min}–{q.max}
            {q.unit ? ` ${q.unit}` : ''}
            {revealing && host.correctValue != null && (
              <strong style={{ color: 'var(--accent)' }}>
                {' '}
                · tačno: {host.correctValue}
                {q.unit ? ` ${q.unit}` : ''}
              </strong>
            )}
          </div>
        )}
        {/* Kod broja nema opcija na koje bi avatari seli, pa procene idu u
            zaseban red — inače se sa TV-a ne vidi ko je bio bliži. */}
        {q.kind === 'broj' && revealing && host.correctValue != null && (
          <Guesses
            players={host.players}
            results={host.results ?? []}
            correct={host.correctValue}
            unit={q.unit}
          />
        )}
      </div>
      {/* Dok se odgovara — ko je već potvrdio. U otkrivanju ovo nestaje, jer
          avatari tada stoje na samim opcijama i ovo bi bilo isto dvaput. */}
      {!revealing && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(host.expectedIds ?? []).map((id) => {
            const p = host.players.find((x) => x.playerId === id);
            if (!p) return null;
            return (
              <Chip
                key={id}
                player={p}
                dim={!answered.has(id)}
                label={answered.has(id) ? 'odgovorio' : '…'}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Slika uz pitanje. Kviz pakovi je nose i na `obicno` i na `broj` pitanjima, a
 * telefon je oduvek prikazivao — bez ovoga je pitanje tipa „koji je ovo grb"
 * na TV-u bilo samo tekst. Panel je uska traka ispod table, pa slika ide kao
 * sličica fiksne visine: `contain` da se ne iseca, a ako link pukne, element
 * se skloni umesto da ostavi razbijenu ikonicu na ekranu.
 */
function QuestionImage({ url, height = '4.6rem' }: { url?: string; height?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      style={{
        height,
        maxWidth: '22%',
        objectFit: 'contain',
        borderRadius: '10px',
        border: '1px solid var(--line)',
        background: 'rgba(0,0,0,0.2)',
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Procene na broj-pitanju, poređane od najbliže. Bez ovoga se posle broja vidi
 * samo ishod, a ne i zašto je takav.
 */
function Guesses({
  players,
  results,
  correct,
  unit,
}: {
  players: BitkaPlayerView[];
  results: BitkaAnswerResult[];
  correct: number;
  unit?: string;
}) {
  const rows = results
    .map((r) => ({ r, p: players.find((x) => x.playerId === r.playerId) }))
    .filter((row): row is { r: BitkaAnswerResult; p: BitkaPlayerView } => !!row.p)
    .sort((a, b) => {
      const da = a.r.value == null ? Infinity : Math.abs(a.r.value - correct);
      const db = b.r.value == null ? Infinity : Math.abs(b.r.value - correct);
      return da - db;
    });
  if (rows.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
      {rows.map(({ r, p }, i) => {
        const best = i === 0 && r.value != null;
        return (
          <span
            key={p.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              background: 'var(--bg-secondary)',
              border: `1px solid ${best ? 'var(--success)' : 'var(--line2)'}`,
              opacity: r.value == null ? 0.45 : 1,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            <span style={{ fontSize: '1rem' }}>{p.avatarEmoji}</span>
            <span>{p.name}</span>
            <span style={{ color: best ? 'var(--success)' : 'var(--text-secondary)' }}>
              {r.value == null ? 'nije stigao' : `${r.value}${unit ? ` ${unit}` : ''}`}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Broj koji je razrešio nerešen duel. Stoji ispod izbornog pitanja, jer su ga
 * obojica odigrala isto — tek ovaj broj kaže ko je uzeo zemlju.
 */
function TiebreakStrip({ host }: { host: BitkaHostData }) {
  const tb = host.tiebreak!;
  return (
    <div
      style={{
        borderTop: '1px solid var(--line)',
        paddingTop: '0.4rem',
        display: 'flex',
        gap: '0.7rem',
        alignItems: 'center',
      }}
    >
      {/* Manja sličica nego gore: ovo je druga slika na istom ekranu, uz izborno
          pitanje koje već ima svoju. */}
      <QuestionImage url={tb.question.imageUrl} height="3.2rem" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          <strong style={{ color: 'var(--accent)' }}>Nerešeno — odlučio je broj:</strong>{' '}
          {tb.question.text}{' '}
          <strong style={{ color: 'var(--accent)' }}>
            · tačno: {tb.correctValue}
            {tb.question.unit ? ` ${tb.question.unit}` : ''}
          </strong>
        </div>
        <Guesses
          players={host.players}
          results={tb.results}
          correct={tb.correctValue}
          unit={tb.question.unit}
        />
      </div>
    </div>
  );
}

/** „Pera ⚔ Mika · Porodin" + zidovi, ako se udara na zamak. */
function DuelHeader({ host }: { host: BitkaHostData }) {
  const duel = host.duel!;
  const attacker = host.players.find((p) => p.playerId === duel.attackerId);
  const defender = host.players.find((p) => p.playerId === duel.defenderId);
  const place = host.map.territories.find((t) => t.id === duel.territoryId)?.name ?? '';
  const walls = host.board.find((st) => st.id === duel.territoryId)?.walls ?? 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
      <Side player={attacker} role="napada" />
      <span style={{ fontSize: '1.4rem' }}>⚔️</span>
      {defender ? (
        <Side player={defender} role="brani" />
      ) : (
        <span style={{ fontWeight: 800, color: 'var(--dim)' }}>ničiju zemlju</span>
      )}
      <span style={{ color: 'var(--dim)' }}>za</span>
      <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.15rem' }}>{place}</span>
      {duel.onCastle && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🏰</span>
          <Walls walls={walls} size={12} />
        </span>
      )}
    </div>
  );
}

function Side({ player, role }: { player?: BitkaPlayerView; role: string }) {
  if (!player) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <span
        style={{
          width: '1.9rem',
          height: '1.9rem',
          borderRadius: '50%',
          background: player.avatarColor,
          display: 'grid',
          placeItems: 'center',
          fontSize: '1rem',
        }}
      >
        {player.avatarEmoji}
      </span>
      <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
        {player.name}
      </span>
      <span style={{ fontSize: '0.85rem', color: 'var(--dim)' }}>{role}</span>
    </span>
  );
}

function DuelOutcome({ host }: { host: BitkaHostData }) {
  const duel = host.duel!;
  const named = (id: string | null | undefined) =>
    host.players.find((p) => p.playerId === id)?.name ?? 'Igrač';
  const place = host.map.territories.find((t) => t.id === duel.territoryId)?.name ?? '';
  const walls = host.board.find((st) => st.id === duel.territoryId)?.walls ?? 0;

  const text =
    duel.outcome === 'zamak-pao'
      ? `Zamak je pao — ${named(duel.attackerId)} uzima svu zemlju!`
      : duel.outcome === 'zid'
        ? `Jedan zid manje — ostalo ih je ${walls}.`
        : duel.outcome === 'napadac'
          ? `${place} menja gospodara.`
          : duel.defenderId
            ? `${named(duel.defenderId)} je odbranio ${place}.`
            : `${place} ostaje ničiji.`;
  return <Line title={host.lastEvent ?? 'Ishod'} text={text} />;
}

/** Preostali zidovi zamka kao pločice — puna je zid koji još stoji. */
function Walls({ walls, size = 10 }: { walls: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: `${Math.round(size / 3)}px` }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '2px',
            background: i < walls ? '#F2CE74' : 'rgba(255,255,255,0.18)',
            border: i < walls ? 'none' : '1px solid rgba(255,255,255,0.28)',
            boxSizing: 'border-box',
          }}
        />
      ))}
    </span>
  );
}

function Line({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
      {text && <div style={{ color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{text}</div>}
    </div>
  );
}

function Chip({
  player,
  dim,
  label,
  good,
}: {
  player: BitkaPlayerView;
  dim?: boolean;
  label: string;
  good?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.35rem 0.7rem',
        borderRadius: '999px',
        background: 'var(--bg-secondary)',
        borderLeft: `4px solid ${player.avatarColor}`,
        opacity: dim ? 0.45 : 1,
        transition: 'opacity 0.25s',
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>{player.avatarEmoji}</span>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{player.name}</span>
      <span
        style={{
          fontSize: '0.8rem',
          color: good === true ? 'var(--success)' : good === false ? 'var(--danger)' : 'var(--dim)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Standings({
  players,
  activeId,
  compact,
}: {
  players: BitkaPlayerView[];
  activeId: string | null;
  /** U duelu tabela deli kolonu sa mapom, pa gubi drugi red i malo visine. */
  compact?: boolean;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.4rem' : '0.55rem' }}>
      {sorted.map((p) => (
        <motion.div
          key={p.playerId}
          layout
          style={{
            padding: compact ? '0.4rem 0.7rem' : '0.6rem 0.8rem',
            borderRadius: '12px',
            background: p.playerId === activeId ? 'rgba(194, 155, 71, 0.18)' : 'var(--bg-card)',
            border: `1px solid ${p.playerId === activeId ? 'var(--accent)' : 'var(--line)'}`,
            borderLeft: `5px solid ${p.avatarColor}`,
            opacity: p.eliminated ? 0.4 : 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>{p.avatarEmoji}</span>
            <span style={{ flex: 1, fontWeight: 800, color: 'var(--text-primary)' }}>{p.name}</span>
            <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{p.score}</span>
          </div>
          <div
            style={{
              display: compact && !p.eliminated ? 'none' : 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.82rem',
              color: 'var(--dim)',
              marginTop: '0.2rem',
            }}
          >
            {p.eliminated ? (
              <span>zamak pao — ispao iz bitke</span>
            ) : (
              <>
                <span>🏰</span>
                <Walls walls={p.walls} />
                <span>· {p.territories} teritorija</span>
              </>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Površina table — 3D teren ili ravna mapa sa FX slojem.
 *
 * Dok se three chunk učitava, `Suspense` pokazuje istu tu 2D mapu, pa se tabla
 * vidi odmah i nikad nema praznog mesta na ekranu. Ako WebGL ne postoji,
 * `onFail` trajno vraća prikaz na 2D.
 */
function BoardSurface({
  host,
  board,
  fxEvents,
  use3D,
  onFail,
  focusId,
  highlightIds,
  activePlayerId,
  maxHeightCss,
  fillHeight,
}: {
  host: BitkaHostData;
  /** Zadržana tabla — nije uvek `host.board`, vidi `planFxHolds`. */
  board: BitkaTerritoryState[];
  fxEvents: BitkaFxEvent[];
  use3D: boolean;
  onFail: () => void;
  focusId?: string | null;
  highlightIds?: string[];
  activePlayerId?: string | null;
  maxHeightCss: string;
  /** 3D teren uzima punu visinu roditelja umesto `maxHeightCss`. */
  fillHeight?: boolean;
}) {
  const flat = (withFx: boolean) => (
    <BitkaMapView
      map={host.map}
      board={board}
      players={host.players}
      highlightIds={highlightIds}
      focusId={focusId ?? null}
      activePlayerId={activePlayerId ?? null}
      maxHeightCss={maxHeightCss}
      // Imena atara se ne ispisuju na TV-u: mapa je slika, a ko šta napada
      // ionako piše u donjoj traci punim imenom.
      showNames={false}
    >
      {withFx && (
        <Suspense fallback={null}>
          <BitkaFx events={fxEvents} />
        </Suspense>
      )}
    </BitkaMapView>
  );

  if (!use3D) return flat(true);
  return (
    <Suspense fallback={flat(false)}>
      <BitkaBoard3D
        map={host.map}
        board={board}
        players={host.players}
        focusId={focusId ?? null}
        highlightIds={highlightIds}
        activePlayerId={activePlayerId ?? null}
        events={fxEvents}
        heightCss={fillHeight ? '100%' : maxHeightCss}
        onFail={onFail}
      />
    </Suspense>
  );
}

function FinalBoard({
  host,
  board: displayBoard,
  fxEvents,
  use3D,
  onFail,
}: {
  host: BitkaHostData;
  board: BitkaTerritoryState[];
  fxEvents: BitkaFxEvent[];
  use3D: boolean;
  onFail: () => void;
}) {
  const board = host.leaderboard ?? [];
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '1.1rem 1.4rem',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: 'var(--accent)' }}>
        Bitka je gotova
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: '1.6rem', alignItems: 'center', width: '100%', maxWidth: '1500px' }}>
        {/* Slavlje nad pobednikovim zamkom — 'pobeda' stiže baš na ovaj ekran. */}
        <BoardSurface
          host={host}
          board={displayBoard}
          fxEvents={fxEvents}
          use3D={use3D}
          onFail={onFail}
          maxHeightCss="68vh"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {board.map((entry) => (
            <motion.div
              key={entry.playerId}
              layout
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
                padding: '0.8rem 1rem',
                borderRadius: '14px',
                background: entry.rank === 1 ? 'rgba(194, 155, 71, 0.18)' : 'var(--bg-card)',
                border: `1px solid ${entry.rank === 1 ? 'var(--accent)' : 'var(--line)'}`,
              }}
            >
              <span style={{ width: '2rem', fontWeight: 800, color: 'var(--dim)' }}>{entry.rank}.</span>
              <span
                style={{
                  width: '2.4rem',
                  height: '2.4rem',
                  borderRadius: '50%',
                  background: entry.avatarColor,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '1.3rem',
                }}
              >
                {entry.avatarEmoji}
              </span>
              <span style={{ flex: 1, fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                {entry.name}
              </span>
              <span style={{ color: 'var(--dim)' }}>{entry.territories} ter.</span>
              <span style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent)' }}>{entry.score}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
