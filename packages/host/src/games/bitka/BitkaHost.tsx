import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BitkaAnswerResult, BitkaHostData, BitkaPlayerView } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { BitkaMapView } from './components/BitkaMapView';
import {
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
  'duel-odgovor-rezultat': 'Tačan odgovor',
  'duel-broj': 'Nerešeno — broj odlučuje',
  'duel-broj-rezultat': 'Ko je bio bliži?',
  'duel-ishod': 'Ishod napada',
  'duel-rezultat': 'Ishod napada',
  ended: 'Kraj bitke',
};

/**
 * Faze koje su samo odbrojavanje do pitanja.
 *
 * Pitanje u njima ne stiže ni u broadcast — server ga zadržava dok ne krene
 * odgovaranje. U toj pauzi preko table stoji Objava: krug odbrojava, nadnaslov
 * kaže šta stiže, a naslov nosi posledicu prethodnog poteza (`lastEvent`) —
 * odbrojavanje i „šta se upravo desilo" dele isti trenutak, pa dele i element.
 */
const COUNTDOWN_PHASES = new Set(['redosled-pitanje', 'osvajanje-pitanje', 'duel-pitanje']);

const COUNTDOWN_LABEL: Record<string, string> = {
  'redosled-pitanje': 'Ko bira prvi?',
  'osvajanje-pitanje': 'Pitanje stiže',
  'duel-pitanje': 'Duel počinje',
};

/**
 * Faze u kojima igrač bira na telefonu, a TV samo saopštava ko je na potezu.
 * Naslov, red čekanja i preostalo vreme tada nosi centralna Objava — sat u
 * zaglavlju i traka ispod mape se sklanjaju (pravilo jednog mesta).
 */
const PICK_PHASES = new Set(['baza-izbor', 'osvajanje-izbor', 'napad-izbor']);

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
      if (
        phase === 'osvajanje-rezultat' ||
        phase === 'redosled-rezultat' ||
        phase === 'duel-odgovor-rezultat' ||
        phase === 'duel-broj-rezultat'
      )
        play('reveal');
      if (phase === 'baza-izbor' || phase === 'napad-izbor') play('join');
    }
  }, [phase, play]);

  // Ishod napada ima svoj zvuk, ali samo jednom po duelu. Vezuje se za PROZOR
  // sa ishodom (`duel-ishod`), jer se tu ishod i saznaje; do `duel-rezultat`
  // ključ je isti, pa se ne ponavlja.
  useEffect(() => {
    const outcome = host?.duel?.outcome ?? host?.duel?.pendingOutcome;
    if ((phase !== 'duel-ishod' && phase !== 'duel-rezultat') || !outcome) return;
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
      phase === 'osvajanje-izbor' ||
      // Odbrojavanje do pitanja — otkucaji su mu cela poenta.
      COUNTDOWN_PHASES.has(phase ?? '');
    const sec = Math.ceil(gameState.timeRemaining);
    if (answering && sec !== prevSecRef.current && sec <= 5 && sec > 0) play('tick');
    prevSecRef.current = sec;
  }, [gameState, phase, play]);

  // Zvuk najave napada — jednom po duelu, na ulasku u `duel-pitanje`. Sama
  // najava je deo Objave sa odbrojavanjem i stoji celu fazu, pa ovde ostaje
  // samo zvuk. Nastavak opsade ga ne dobija: napadač i meta su isti.
  const duelKey =
    phase === 'duel-pitanje' && host?.duel && !host.duel.opsadaNastavak
      ? `${host.duel.attackerId}:${host.duel.territoryId}`
      : '';
  useEffect(() => {
    if (duelKey) play('reveal');
  }, [duelKey, play]);

  if (!gameState || !host) return null;
  // Naslovi i tabela poena idu po pravom stanju; kasni samo mapa.
  const displayBoard = shownBoard.length > 0 ? shownBoard : host.board;

  // Zasebnog završnog ekrana nema — `ended` stigne u jednom broadcast-u i već
  // sledećeg trenutka platforma preuzima sa poenima i diplomama. Ovo je samo
  // prelazni kadar da ne bljesne prazno.
  if (phase === 'ended') {
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
  const duelArena =
    (phase === 'duel-odgovor' ||
      phase === 'duel-broj' ||
      // Otkrivanje ostaje NA ekranu pitanja: isti raspored, samo se opcije
      // oboje i avatari sednu na ono što je ko izabrao.
      phase === 'duel-odgovor-rezultat' ||
      phase === 'duel-broj-rezultat') &&
    !!host.duel;
  // U fazama izbora vreme nosi krug Objave — sat u zaglavlju bi bio isti broj
  // na dva mesta u istom kadru.
  const showClock =
    phase === 'redosled-odgovor' ||
    phase === 'osvajanje-odgovor' ||
    phase === 'duel-odgovor' ||
    phase === 'duel-broj';

  // Rezultat osvajanja bez ijednog tačnog odgovora: jedini ishod bez
  // pobednika, pa umesto otkrivanja na traci stoji siva Objava sa zastavicom.
  const nikoTacan =
    phase === 'osvajanje-rezultat' && !(host.results ?? []).some((r) => r.correct);

  // Dok Objava stoji, traka ispod mape se sklanja — ista rečenica ne sme na
  // dva mesta u istom kadru, a zaglavlje zadržava samo kontekst.
  const objavaUp =
    COUNTDOWN_PHASES.has(phase ?? '') ||
    PICK_PHASES.has(phase ?? '') ||
    (phase === 'duel-ishod' && !!host.duel?.pendingOutcome) ||
    nikoTacan;

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

      {/* U duelu pitanje stoji u svojoj koloni; dok Objava stoji, traka se
          sklanja — ista rečenica nikad na dva mesta u istom kadru. */}
      {!duelArena && !objavaUp && (
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

      {/* Jedan centralni element — Objava — nosi sve poruke iz partije:
          odbrojavanje, ko je na potezu, najavu duela i ishod napada. Providna
          je da mapa ostane vidljiva; levi krug je jedini deo koji se menja
          (broj kad se odbrojava, glif kad se javlja ishod). */}
      <AnimatePresence>
        {nikoTacan ? (
          <NikoTacanObjava key="niko-tacan" host={host} />
        ) : phase === 'duel-ishod' && host.duel?.pendingOutcome ? (
          <IshodObjava key="duel-ishod" host={host} />
        ) : phase === 'duel-pitanje' && host.duel ? (
          <DuelNajavaObjava key={`najava:${host.duel.territoryId}`} host={host} seconds={seconds} />
        ) : COUNTDOWN_PHASES.has(phase ?? '') ? (
          <CountdownObjava key={phase} host={host} phase={phase ?? ''} seconds={seconds} />
        ) : PICK_PHASES.has(phase ?? '') ? (
          <PickObjava key={phase} host={host} phase={phase ?? ''} seconds={seconds} />
        ) : null}
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
        {/* U `duel-rezultat` pitanja više nema — otkriveno je na svom ekranu
            (`duel-odgovor-rezultat`, pa `duel-broj-rezultat`), a ovaj ekran je
            mapa i preuzimanje zemlje. Server ga tamo i ne šalje. */}
        {host.question && <QuestionPanel host={host} phase={phase} />}
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

  // Faze izbora (baza/osvajanje/napad) ne stižu dovde: njihov naslov, red
  // čekanja i vreme nosi centralna Objava, a traka je tada sklonjena.

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

/** Ikona i boja ishoda — isti rečnik na TV-u i na telefonu. */
const ISHOD_GLYPH: Record<
  string,
  { glyph: string; color: string; ring: string; label: string }
> = {
  napadac: { glyph: '⚔️', color: '#F2CE74', ring: 'rgba(242,206,116,0.7)', label: 'Teritorija je pala' },
  branilac: { glyph: '🛡️', color: '#7fd1a3', ring: 'rgba(127,209,163,0.7)', label: 'Odbrana je izdržala' },
  zid: { glyph: '🧱', color: '#F2CE74', ring: 'rgba(242,206,116,0.7)', label: 'Zid je srušen' },
  'zamak-pao': { glyph: '🏰', color: '#e06a5e', ring: 'rgba(224,106,94,0.75)', label: 'Zamak je pao' },
};

// --- Objava ------------------------------------------------------------------

/**
 * Jedan centralni element za sve poruke iz partije.
 *
 * Providan prekrivač preko table + kartica: krug levo (broj kad se odbrojava,
 * glif kad se javlja ishod), desno nadnaslov, naslov u jednoj rečenici i
 * podred. Zatamnjenje je obično `rgba`, a NE `backdrop-filter` — ispod je
 * WebGL platno, čija snimka ume da ispadne crna, pa bi se umesto pritamnjene
 * table videla rupa.
 */
function Objava({
  dim = 0.42,
  border = 'rgba(242,206,116,0.4)',
  cardBg = 'rgba(9,20,36,0.52)',
  pulse = false,
  sheen = true,
  circle,
  children,
}: {
  /** Zatamnjenje table: 0.42 za odbrojavanja i poteze, 0.58 samo za ishod. */
  dim?: number;
  border?: string;
  cardBg?: string;
  /** Crveni puls opsade — jedini napad koji izbacuje igrača iz partije. */
  pulse?: boolean;
  sheen?: boolean;
  circle: React.ReactNode;
  children: React.ReactNode;
}) {
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
        background: `rgba(9,20,36,${dim})`,
        pointerEvents: 'none',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 1.04 }}
        transition={{ type: 'spring', stiffness: 360, damping: 24 }}
        className={pulse ? 'bitka-siege' : undefined}
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: '2rem',
          padding: '1.7rem 2.6rem 1.7rem 1.7rem',
          borderRadius: '28px',
          background: cardBg,
          border: `1px solid ${border}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          maxWidth: '82vw',
        }}
      >
        {sheen && <span className="bitka-sheen" />}
        {circle}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Krug Objave sa brojem — odbrojavanje; na svaku sekundu uskoči nov broj. */
function ObjavaBroj({
  seconds,
  color = '#F2CE74',
  border = 'rgba(242,206,116,0.6)',
  glow = 'rgba(242,206,116,0.22)',
}: {
  seconds: number;
  color?: string;
  border?: string;
  glow?: string;
}) {
  return (
    <motion.span
      // Ključ je sam broj: element se svake sekunde zameni novim, pa se ulazna
      // animacija odigra ponovo — bez ijednog dodatnog tajmera.
      key={seconds}
      initial={{ opacity: 0, scale: 1.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      style={{
        width: '9rem',
        height: '9rem',
        flexShrink: 0,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(9,20,36,0.5)',
        border: `3px solid ${border}`,
        boxShadow: `0 0 70px ${glow}`,
        fontFamily: 'var(--font-display)',
        fontSize: '4.6rem',
        fontWeight: 800,
        lineHeight: 1,
        color,
      }}
    >
      {seconds}
    </motion.span>
  );
}

/** Krug Objave sa glifom — ishod umesto broja, isti gabarit. */
function ObjavaGlif({ glyph, border }: { glyph: string; border: string }) {
  return (
    <span
      style={{
        width: '9rem',
        height: '9rem',
        flexShrink: 0,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(9,20,36,0.5)',
        border: `3px solid ${border}`,
        fontSize: '4rem',
        lineHeight: 1,
      }}
    >
      {glyph}
    </span>
  );
}

function ObjavaNadnaslov({
  children,
  color = '#F2CE74',
  spacing = '0.28em',
}: {
  children: React.ReactNode;
  color?: string;
  spacing?: string;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        textTransform: 'uppercase',
        letterSpacing: spacing,
        fontSize: '1rem',
        color,
      }}
    >
      {children}
    </span>
  );
}

function ObjavaNaslov({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: '2.6rem',
        fontWeight: 800,
        lineHeight: 1.1,
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </span>
  );
}

function ObjavaPodred({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: '1.15rem', color: 'var(--text-secondary)' }}>{children}</span>;
}

/**
 * Odbrojavanje do pitanja. Krug broji, nadnaslov kaže šta stiže, a naslov nosi
 * posledicu prethodnog poteza („Pera uzima Porodin") — dele isti trenutak, pa
 * dele i element. U `redosled-pitanje` još nema posledice, ostaje sam brojač.
 */
function CountdownObjava({
  host,
  phase,
  seconds,
}: {
  host: BitkaHostData;
  phase: string;
  seconds: number;
}) {
  const title = phase === 'osvajanje-pitanje' ? host.lastEvent : undefined;
  return (
    <Objava circle={<ObjavaBroj seconds={seconds} />}>
      <ObjavaNadnaslov>{COUNTDOWN_LABEL[phase] ?? 'Pitanje stiže'}</ObjavaNadnaslov>
      {title && <ObjavaNaslov>{title}</ObjavaNaslov>}
    </Objava>
  );
}

/**
 * Faza izbora: ko je na potezu, ko čeka i koliko je vremena ostalo — sve u
 * jednoj Objavi umesto tri mesta (sat gore, naslov u zaglavlju, red u traci).
 */
function PickObjava({
  host,
  phase,
  seconds,
}: {
  host: BitkaHostData;
  phase: string;
  seconds: number;
}) {
  const named = (id: string | null | undefined) =>
    host.players.find((p) => p.playerId === id)?.name ?? 'Igrač';
  const queue = (host.pickQueue ?? []).slice(1);

  if (phase === 'baza-izbor') {
    const done = new Set(host.baseCommittedIds ?? []);
    return (
      <Objava circle={<ObjavaBroj seconds={seconds} />}>
        <ObjavaNadnaslov>Podizanje zamkova</ObjavaNadnaslov>
        <ObjavaNaslov>{named(host.activePlayerId)} bira mesto za zamak</ObjavaNaslov>
        <ObjavaPodred>
          {queue.length > 0
            ? `Na redu posle: ${queue.map(named).join(', ')} — vide gde su zamkovi već podignuti.`
            : 'Poslednji zamak.'}
        </ObjavaPodred>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
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
      </Objava>
    );
  }

  if (phase === 'napad-izbor') {
    return (
      <Objava circle={<ObjavaBroj seconds={seconds} />}>
        <ObjavaNadnaslov>Izbor mete</ObjavaNadnaslov>
        <ObjavaNaslov>{named(host.activePlayerId)} bira metu</ObjavaNaslov>
        <ObjavaPodred>Napada se susedna tuđa ili ničija teritorija.</ObjavaPodred>
      </Objava>
    );
  }

  return (
    <Objava circle={<ObjavaBroj seconds={seconds} />}>
      <ObjavaNadnaslov>Biranje teritorije</ObjavaNadnaslov>
      <ObjavaNaslov>{named(host.activePlayerId)} bira slobodnu teritoriju</ObjavaNaslov>
      <ObjavaPodred>
        {queue.length > 0
          ? `Na redu posle: ${queue.map(named).join(', ')}`
          : 'Poslednji izbor u ovoj rundi.'}
      </ObjavaPodred>
    </Objava>
  );
}

/**
 * Niko nije odgovorio tačno — jedini ishod bez pobednika, zato bez zlatne
 * konture, bez sjaja i bez glifa oružja: sivi krug sa zastavicom. Mapa se ne
 * menja, pa zatamnjenje ostaje slabo.
 */
function NikoTacanObjava({ host }: { host: BitkaHostData }) {
  const q = host.question;
  const correct =
    q?.kind === 'izbor' && host.correctIndex != null
      ? q.options?.[host.correctIndex]?.text
      : host.correctValue != null
        ? `${host.correctValue}${q?.unit ? ` ${q.unit}` : ''}`
        : null;
  return (
    <Objava
      border="rgba(138,145,162,0.55)"
      sheen={false}
      circle={<ObjavaGlif glyph="🚩" border="rgba(138,145,162,0.55)" />}
    >
      <ObjavaNadnaslov color="#c9c2b3">Niko tačan</ObjavaNadnaslov>
      <ObjavaNaslov>Niko ne uzima zemlju</ObjavaNaslov>
      <ObjavaPodred>
        {correct ? (
          <>
            Tačno je bilo <strong style={{ color: 'var(--accent)' }}>{correct}</strong> —
            teritorije ostaju slobodne.
          </>
        ) : (
          'Teritorije ostaju slobodne.'
        )}
      </ObjavaPodred>
    </Objava>
  );
}

/**
 * Ishod napada — ista Objava, samo krug menja glif i boju konture: zelena za
 * odbranu, zlatna za pad teritorije, crvena za pad zamka.
 *
 * Stoji dok tabla još pokazuje staro stanje — server posledicu upisuje tek kad
 * prozor istekne, pa se prvo pročita šta se desilo, a animacije krenu posle.
 * Zatamnjenje se ovde diže na 0.58 baš zato što tabla ispod još „laže".
 */
function IshodObjava({ host }: { host: BitkaHostData }) {
  const duel = host.duel!;
  const outcome = duel.pendingOutcome!;
  const look = ISHOD_GLYPH[outcome] ?? ISHOD_GLYPH.napadac;
  const named = (id: string | null | undefined) =>
    host.players.find((p) => p.playerId === id)?.name ?? 'Igrač';
  const territory = host.map.territories.find((t) => t.id === duel.territoryId);
  const place = territory?.name ?? '';
  const walls = duel.wallsAfter ?? host.board.find((x) => x.id === duel.territoryId)?.walls ?? 0;

  const sub =
    outcome === 'zamak-pao'
      ? duel.defenderId
        ? `${named(duel.defenderId)} ispada iz bitke — sve preuzima ${named(duel.attackerId)}.`
        : `Sve preuzima ${named(duel.attackerId)}.`
      : outcome === 'zid'
        ? 'Opsada se nastavlja — novo pitanje protiv istog zamka.'
        : outcome === 'napadac'
          ? `${named(duel.attackerId)} osvaja ${territoryValue(territory ?? {})} poena.`
          : duel.defenderId
            ? `Napad propada — ${named(duel.attackerId)} ostaje bez poteza u ovoj rundi.`
            : `${place} ostaje ničiji.`;

  return (
    <Objava
      dim={0.58}
      cardBg="rgba(9,20,36,0.6)"
      border={look.color}
      circle={<ObjavaGlif glyph={look.glyph} border={look.ring} />}
    >
      <ObjavaNadnaslov color={look.color} spacing="0.24em">
        {look.label}
      </ObjavaNadnaslov>
      <ObjavaNaslov>{host.lastEvent ?? place}</ObjavaNaslov>
      <ObjavaPodred>{sub}</ObjavaPodred>
      {duel.onCastle && outcome !== 'zamak-pao' && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>zidovi</span>
          <Walls walls={walls} size={16} />
        </span>
      )}
    </Objava>
  );
}

/**
 * Duel počinje — najava i odbrojavanje u istom kadru: strane duela u naslovu,
 * krug već broji do pitanja. Kartica najave više nije poseban ekran, pa faza
 * traje samo pauzu za čitanje.
 *
 * Opsada je jedini napad koji izbacuje igrača iz partije — zato je to jedina
 * varijanta koja celu Objavu boji u crveno i nosi stanje zidova. Nastavak
 * opsade ne dobija punu najavu (ista poruka po treći put u istom napadu je
 * šum) — ostaje krug sa odbrojavanjem i rečenica o nastavku.
 */
function DuelNajavaObjava({ host, seconds }: { host: BitkaHostData; seconds: number }) {
  const duel = host.duel!;
  const siege = duel.onCastle;
  const attacker = host.players.find((p) => p.playerId === duel.attackerId);
  const defender = host.players.find((p) => p.playerId === duel.defenderId);
  const territory = host.map.territories.find((t) => t.id === duel.territoryId);
  const st = host.board.find((x) => x.id === duel.territoryId);
  const walls = st?.walls ?? 0;
  const value = st?.castle ? BITKA_ZAMAK_BODOVI : territoryValue(territory ?? {});

  const circle = (
    <ObjavaBroj
      seconds={seconds}
      color={siege ? '#f0b3ab' : '#F2CE74'}
      border={siege ? 'rgba(224,106,94,0.75)' : 'rgba(242,206,116,0.6)'}
      glow={siege ? 'rgba(224,106,94,0.25)' : 'rgba(242,206,116,0.22)'}
    />
  );

  if (duel.opsadaNastavak) {
    return (
      <Objava dim={0.5} border="#e06a5e" cardBg="rgba(9,20,36,0.6)" circle={circle}>
        <ObjavaNadnaslov color="#f0b3ab">🏰 Opsada se nastavlja</ObjavaNadnaslov>
        {host.lastEvent && <ObjavaNaslov>{host.lastEvent}</ObjavaNaslov>}
      </Objava>
    );
  }

  return (
    <Objava
      dim={siege ? 0.5 : 0.42}
      border={siege ? '#e06a5e' : 'rgba(242,206,116,0.4)'}
      cardBg={siege ? 'rgba(9,20,36,0.6)' : 'rgba(9,20,36,0.52)'}
      pulse={siege}
      circle={circle}
    >
      <ObjavaNadnaslov color={siege ? '#f0b3ab' : '#F2CE74'}>
        {siege
          ? '🏰 Opsada zamka · duel počinje'
          : defender
            ? 'Duel počinje · napad'
            : 'Duel počinje · pohod na ničiju zemlju'}
      </ObjavaNadnaslov>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
        <NajavaSide player={attacker} role="napada" />
        <span
          style={{
            fontSize: '2.2rem',
            filter: `drop-shadow(0 0 18px ${siege ? 'rgba(224,106,94,0.7)' : 'rgba(242,206,116,0.7)'})`,
          }}
        >
          ⚔️
        </span>
        {defender ? (
          <NajavaSide player={defender} role={siege ? 'brani zamak' : 'brani'} mirrored />
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
          padding: '0.4rem 1.1rem',
          borderRadius: '999px',
          background: siege ? 'rgba(224,106,94,0.16)' : 'rgba(242,206,116,0.14)',
          border: `1px solid ${siege ? 'rgba(224,106,94,0.45)' : 'rgba(242,206,116,0.4)'}`,
          alignSelf: 'flex-start',
        }}
      >
        <span style={{ fontSize: '1.2rem' }}>{st?.castle ? '🏰' : '🚩'}</span>
        <span
          style={{
            fontWeight: 800,
            fontSize: '1.2rem',
            color: siege ? '#f0b3ab' : '#F2CE74',
          }}
        >
          {territory?.name ?? ''}
        </span>
        {siege && (
          <>
            <Walls walls={walls} size={12} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              · još {walls} od 3
            </span>
          </>
        )}
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          · {value} poena
        </span>
      </div>
    </Objava>
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
  // Otkrivanje se dešava na OVOM ekranu, pre nego što se pređe na mapu: isti
  // raspored, samo se opcije oboje i vidi se ko je šta izabrao.
  const revealing = phase.endsWith('-rezultat');
  const results = host.results ?? [];
  const verdictOf = (playerId?: string): string | undefined => {
    if (!revealing || !playerId) return undefined;
    const r = results.find((x) => x.playerId === playerId);
    if (q?.kind === 'broj') {
      if (r?.value == null) return 'nije stigao';
      return `${r.value}${q.unit ? ` ${q.unit}` : ''} · ${r.seconds ?? '?'}s`;
    }
    if (!r || r.optionIndex == null) return 'bez odgovora';
    return r.correct ? 'tačno ✓' : 'netačno ✗';
  };
  const goodOf = (playerId?: string): boolean | undefined => {
    if (!revealing || !playerId || q?.kind === 'broj') return undefined;
    return !!results.find((x) => x.playerId === playerId)?.correct;
  };
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
        <DuelSlot
          player={attacker}
          role="napada"
          committed={duel.attackerCommitted}
          verdict={verdictOf(duel.attackerId)}
          good={goodOf(duel.attackerId)}
        />
        <span style={{ fontSize: '1.6rem' }}>⚔️</span>
        {defender ? (
          <DuelSlot
            player={defender}
            role={duel.onCastle ? 'brani zamak' : 'brani'}
            committed={duel.defenderCommitted}
            verdict={verdictOf(duel.defenderId ?? undefined)}
            good={goodOf(duel.defenderId ?? undefined)}
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
                {q.options.map((o) => {
                  const right = revealing && host.correctIndex === o.index;
                  // Avatari sedaju na opciju koju je taj igrač izabrao — ceo
                  // ishod pitanja se tako čita sa jednog mesta.
                  const takers = revealing
                    ? results
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
                        gap: '0.5rem',
                        padding: '0.8rem 1rem',
                        borderRadius: '12px',
                        background: right ? 'var(--success)' : o.color,
                        border: right ? '3px solid #fff' : '3px solid transparent',
                        opacity: revealing && !right ? 0.35 : 1,
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '1.3rem',
                        transition: 'opacity 0.25s',
                      }}
                    >
                      {right && <span>✓</span>}
                      <span style={{ flex: 1 }}>{o.text}</span>
                      {takers.map((p) => (
                        <span
                          key={p.playerId}
                          title={p.name}
                          style={{
                            width: '2rem',
                            height: '2rem',
                            borderRadius: '50%',
                            background: p.avatarColor,
                            border: '2px solid rgba(0,0,0,0.35)',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: '1rem',
                            flexShrink: 0,
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
            {/* Otkrivanje izbornog pitanja koje nije razrešilo duel — bez ove
                rečenice izgleda kao da posle tačnog odgovora sledi mapa, pa
                klizač banjne niotkuda. */}
            {revealing && duel.tiebreakPending && (
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>
                Nerešeno — odlučiće broj.
              </div>
            )}
            {q.kind === 'broj' && !revealing && (
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Procenjuje se broj — opseg {q.min}–{q.max}
                {q.unit ? ` ${q.unit}` : ''}. Bliži uzima zemlju.
              </div>
            )}
            {/* Otkrivanje broja: tačna vrednost krupno, a ispod obe procene
                poređane po blizini — tek tu se vidi zašto je zemlja otišla
                onome kome je otišla. */}
            {q.kind === 'broj' && revealing && host.correctValue != null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>
                  Tačno: {host.correctValue}
                  {q.unit ? ` ${q.unit}` : ''}
                </div>
                <Guesses
                  players={host.players}
                  results={results}
                  correct={host.correctValue}
                  unit={q.unit}
                />
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
  verdict,
  good,
}: {
  player?: BitkaPlayerView;
  role: string;
  committed: boolean;
  /** Postoji samo u otkrivanju — tada zamenjuje „zaključao ✓". */
  verdict?: string;
  good?: boolean;
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
        background:
          good === false
            ? 'rgba(224,106,94,0.16)'
            : committed
              ? 'rgba(87,179,128,0.16)'
              : 'rgba(245,235,224,0.06)',
        border:
          good === false
            ? '1px solid var(--danger)'
            : committed
              ? '1px solid var(--success)'
              : '1px dashed var(--line2)',
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
          color:
            good === false
              ? 'var(--danger)'
              : verdict || committed
                ? 'var(--success)'
                : 'var(--text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        {verdict ?? (committed ? 'zaključao ✓' : 'razmišlja…')}
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
