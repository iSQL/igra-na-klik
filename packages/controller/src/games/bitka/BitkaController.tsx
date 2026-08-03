import { useEffect, useRef, useState } from 'react';
import {
  deriveFxEvents,
  planFxHolds,
  type BitkaControllerData,
  type BitkaFxEvent,
  type BitkaFxSnapshot,
  type BitkaHostData,
  type BitkaPlayerView,
  type BitkaTerritoryState,
} from '@igra/shared';
import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { useHaptics } from '../../hooks/useHaptics';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { BrojSlider } from '../quiz/components/BrojSlider';
import { BitkaMapPicker } from './components/BitkaMapPicker';
import { BitkaHostlessPanel, BitkaMiniStandings } from './components/BitkaHostlessPanel';
import { BitkaTiebreak } from './components/BitkaTiebreak';

function act(action: string, data: Record<string, unknown> = {}) {
  socket.emit('game:player-action', { action, data });
}

export default function BitkaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const haptics = useHaptics();
  // Lokalni odjek sopstvenog tapa — samo da se izabrana teritorija odmah
  // oboji, pre nego što stigne novo stanje sa servera.
  const [draft, setDraft] = useState<string | null>(null);

  // Draft ne sme da pređe u sledeću fazu: bez ovoga bi ulazak u „izaberi metu
  // napada" zatekao izbor iz prethodne faze i pisao „Izabrao si X" za nešto što
  // igrač nije taknuo (najčešće za teritoriju koju je maločas osvojio).
  const phaseKey = gameState?.phase;
  useEffect(() => {
    setDraft(null);
  }, [phaseKey]);

  // Odjek promena na mapi. Ista funkcija koju TV koristi za 3D efekte živi u
  // `@igra/shared`, pa telefon i televizor govore istim rečnikom događaja —
  // ovde se od njih pravi samo blesak teritorije i vibracija.
  const hostMaybe = gameState?.data?.host as BitkaHostData | undefined;
  const [fxEvents, setFxEvents] = useState<BitkaFxEvent[]>([]);
  /**
   * Tabla koju crta mapa. NAMERNO je zasebno stanje, a ne `host.board`:
   * efekti se izvode u `useEffect`-u, koji radi tek posle iscrtavanja, pa bi
   * nove boje bljesnule jedan kadar pre nego što ih zadržavanje vrati. Ovako
   * mapa sirovu tablu nikad i ne vidi — kasni tačno onoliko koliko treba da
   * bljesak stigne prvi.
   */
  const [shownBoard, setShownBoard] = useState<BitkaTerritoryState[]>([]);
  const prevSnapRef = useRef<BitkaFxSnapshot | null>(null);
  const liveBoardRef = useRef<BitkaTerritoryState[]>([]);
  const fxIdRef = useRef(0);
  const holdTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => holdTimersRef.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!hostMaybe || !phaseKey) return;
    liveBoardRef.current = hostMaybe.board;
    const snapshot: BitkaFxSnapshot = { phase: phaseKey, host: hostMaybe };
    const prevBoard = prevSnapRef.current?.host.board;
    const events = deriveFxEvents(prevSnapRef.current, snapshot, () => ++fxIdRef.current);
    prevSnapRef.current = snapshot;

    // Prvo udar, pa promena boje: teritorija ostaje u starom izgledu tačno dok
    // njena animacija ne krene.
    const holds = events.length > 0 ? planFxHolds(prevBoard, events) : [];
    const heldNow = new Map(holds.map((h) => [h.territoryId, h.state]));
    setShownBoard(hostMaybe.board.map((st) => heldNow.get(st.id) ?? st));
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
    // Vibracija samo za ono što se tiče mene — inače telefon zuji ceo meč.
    const mine = events.some((ev) => {
      if (!playerId) return false;
      const st = hostMaybe.board.find((s) => s.id === ev.territoryId);
      const duel = hostMaybe.duel;
      if (ev.kind === 'osvojeno') return st?.ownerId === playerId;
      return duel?.attackerId === playerId || duel?.defenderId === playerId;
    });
    if (mine) {
      const bad = events.some((ev) => ev.kind === 'zamak-pao' || ev.kind === 'zid');
      if (bad) haptics.error();
      else haptics.success();
    }
  }, [hostMaybe, phaseKey, playerId, haptics]);

  if (!gameState || !playerId) return null;
  const host = gameState.data.host as BitkaHostData | undefined;
  if (!host) return null;
  const me = gameState.playerData[playerId] as unknown as BitkaControllerData | undefined;
  const phase = gameState.phase;
  const seconds = gameState.timeRemaining;
  // Mapa crta zadržano stanje; sve ostalo (poeni, tabla) ide odmah.
  // Prvi render je pre nego što efekat išta upiše, pa tada ide živa tabla.
  const displayBoard = shownBoard.length > 0 ? shownBoard : host.board;

  const named = (id: string | null | undefined) =>
    host.players.find((p) => p.playerId === id)?.name ?? 'Igrač';
  const territoryName = (id: string | null | undefined) =>
    host.map.territories.find((t) => t.id === id)?.name ?? '';

  // --- kraj ----------------------------------------------------------------
  if (phase === 'rezultat' || phase === 'ended') {
    const entries = (host.leaderboard ?? []).map((e) => ({
      playerId: e.playerId,
      name: e.name,
      avatarColor: e.avatarColor,
      avatarEmoji: e.avatarEmoji,
      score: e.score,
      rank: e.rank,
    }));
    if (hostless) {
      return <HostlessLeaderboard title="Bitka je gotova" entries={entries} myPlayerId={playerId} />;
    }
    const mine = entries.find((e) => e.playerId === playerId);
    return (
      <Center>
        <Big>{mine?.rank === 1 ? '👑 Pobeda!' : `${mine?.rank ?? '-'}. mesto`}</Big>
        <Muted>{mine ? `${mine.score} poena` : ''}</Muted>
      </Center>
    );
  }

  if (me?.eliminated) {
    return (
      <MapStage
        top={
          <>
            <Big>🏳️ Ispao si iz bitke</Big>
            <Muted>Zamak ti je pao. Gledaj kako se ostali dovršavaju.</Muted>
          </>
        }
      >
        <BitkaMapPicker
          fill
          map={host.map}
          board={displayBoard}
          players={host.players}
          focusId={host.duel?.territoryId ?? null}
          activePlayerId={host.activePlayerId ?? null}
          // Baš ovaj igrač NAJVIŠE treba da vidi kako mu je zamak pao — bez
          // ovoga je gledao samo trenutnu promenu boje na pola mape.
          fxEvents={fxEvents}
        />
      </MapStage>
    );
  }

  // --- pitanja -------------------------------------------------------------
  const question = host.question;
  const answering =
    phase === 'osvajanje-odgovor' || phase === 'duel-odgovor';
  const guessing = phase === 'redosled-odgovor' || phase === 'duel-broj';
  const iAnswer = (host.expectedIds ?? []).includes(playerId);

  // Otkrivanje ostaje na ekranu PITANJA: tu se vidi ko je šta odabrao i šta je
  // tačno. Tek posle toga ide čist ekran za izbor teritorije.
  const revealing = phase === 'osvajanje-rezultat' || phase === 'duel-rezultat';

  /**
   * Ishod duela je izuzetak: pitanje se NE zadržava preko celog ekrana.
   *
   * Poenta duela se dešava na mapi — gori zid, zemlja menja gospodara, zamak
   * pada — a to se odigra tačno u trenutku ulaska u `duel-rezultat`. Pitanje
   * preko celog ekrana mapu skine sa ekrana, pa duelant propusti baš ono što
   * je maločas izborio (efekat se kasnije, kad se mapa vrati, odigra u prazno
   * ili nikako, ako je tim udarcem partija završena). Kod nerešenog duela je
   * uz to i izgledalo kao da posle klizača stiže novo izborno pitanje.
   *
   * Šta je bilo tačno i ko je šta izabrao čita se preko mape (`Reveal`,
   * odnosno hostless traka), a puno otkrivanje nosi TV — kao i u ostalim
   * igrama, sa televizorom u sobi telefon ne duplira ekran.
   */
  const duelReveal = phase === 'duel-rezultat';

  if ((answering || (revealing && !duelReveal)) && question?.kind === 'izbor' && iAnswer) {
    const results = host.results ?? [];
    const pickedBy = (index: number) =>
      results
        .filter((r) => r.optionIndex === index)
        .map((r) => host.players.find((p) => p.playerId === r.playerId))
        .filter((p): p is BitkaPlayerView => !!p);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.9rem', gap: '0.7rem' }}>
        {phase.startsWith('duel') && host.duel ? (
          <DuelBanner host={host} me={me} seconds={seconds} />
        ) : (
          <Muted>{revealing ? 'Tačan odgovor' : `Osvajanje zemlje · ${seconds}s`}</Muted>
        )}
        <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.3 }}>
          {question.text}
        </p>
        <div style={{ display: 'grid', gap: '0.6rem', flex: 1, alignContent: 'center' }}>
          {(question.options ?? []).map((o) => {
            const picked = me?.selectedIndex === o.index;
            const correct = revealing && host.correctIndex === o.index;
            const takers = revealing ? pickedBy(o.index) : [];
            return (
              <button
                key={o.index}
                disabled={me?.hasAnswered || revealing}
                onClick={() => {
                  haptics.success();
                  act('bitka:answer', { optionIndex: o.index });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.9rem 1rem',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: '#fff',
                  textAlign: 'left',
                  background: correct ? 'var(--success)' : o.color,
                  border: correct
                    ? '3px solid #fff'
                    : picked
                      ? '3px solid var(--text-primary)'
                      : '3px solid transparent',
                  borderRadius: '14px',
                  // U otkrivanju blede samo netačni; dok se odgovara, blede svi
                  // osim onog koji sam izabrao.
                  opacity: revealing ? (correct ? 1 : 0.45) : me?.hasAnswered && !picked ? 0.4 : 1,
                }}
              >
                {correct && <span style={{ fontSize: '1.1rem' }}>✓</span>}
                <span style={{ flex: 1 }}>{o.text}</span>
                {/* Ko je izabrao baš ovaj odgovor — po tome se vidi ko je
                    pogodio, a ko je pao u istu zamku. */}
                <span style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                  {takers.map((p) => (
                    <span
                      key={p.playerId}
                      title={p.name}
                      style={{
                        width: '1.7rem',
                        height: '1.7rem',
                        borderRadius: '50%',
                        background: p.avatarColor,
                        border:
                          p.playerId === playerId ? '2px solid #fff' : '2px solid rgba(0,0,0,0.3)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '0.9rem',
                      }}
                    >
                      {p.avatarEmoji}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {/* Ovde stiže samo osvajanje — ishod duela se gleda na mapi. */}
        {revealing && (
          <Muted>
            {results.some((r) => r.playerId === playerId && r.correct)
              ? 'Pogodio si — biraš teritoriju.'
              : 'Nisi pogodio ovaj put.'}
          </Muted>
        )}
      </div>
    );
  }

  if (guessing && question?.kind === 'broj' && iAnswer && !me?.hasAnswered) {
    if (phase === 'duel-broj' && host.duel) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '0.7rem 0.9rem 0' }}>
            <DuelBanner host={host} me={me} seconds={seconds} />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <BrojSlider
              key={`duel:${question.text}`}
              action="bitka:guess"
              prompt={question.text}
              imageUrl={question.imageUrl}
              min={question.min ?? 0}
              max={question.max ?? 100}
              step={question.step}
              unit={question.unit}
              timeRemaining={seconds}
            />
          </div>
        </div>
      );
    }
    return (
      <BrojSlider
        key={`${phase}:${question.text}`}
        action="bitka:guess"
        prompt={question.text}
        imageUrl={question.imageUrl}
        min={question.min ?? 0}
        max={question.max ?? 100}
        step={question.step}
        unit={question.unit}
        timeRemaining={seconds}
      />
    );
  }

  // --- biranje teritorije --------------------------------------------------
  const picking =
    (phase === 'baza-izbor' || phase === 'osvajanje-izbor' || phase === 'napad-izbor') &&
    me?.isActive &&
    (me?.selectableIds?.length ?? 0) > 0;

  if (picking) {
    const selectable = me!.selectableIds!;
    // Druga brana za draft: `osvajanje-izbor` traje kroz više poteza unutar
    // iste faze, pa promena faze nije dovoljna. Izbor važi samo dok je ta meta
    // i dalje ponuđena — osvojena teritorija ispada iz `selectableIds`.
    const liveDraft = draft && selectable.includes(draft) ? draft : null;
    const chosen = phase === 'baza-izbor' ? (me!.myBaseChoice ?? liveDraft) : liveDraft;
    const title =
      phase === 'baza-izbor'
        ? 'Izaberi mesto za zamak'
        : phase === 'osvajanje-izbor'
          ? 'Uzmi slobodnu teritoriju'
          : 'Izaberi metu napada';
    const send = (id: string) => {
      haptics.success();
      setDraft(id);
      act('bitka:pick', { territoryId: id });
    };

    return (
      <MapStage
        top={
          <>
            <Big>{title}</Big>
            <Seconds value={seconds} />
          </>
        }
        bottom={
          <>
            {hostless && <BitkaMiniStandings host={host} myPlayerId={playerId} />}
            <Muted>
              {chosen
                ? 'Izabrao si ' + territoryName(chosen) + '.'
                : phase === 'baza-izbor'
                  ? 'Izbor je konačan — ostali posle tebe vide gde si se utvrdio.'
                  : 'Tapni teritoriju na mapi, ili je nađi u spisku (⚙ dole desno).'}
            </Muted>
          </>
        }
      >
        {/* Mapa je glavni način da se cilja — dobija ceo ekran. Spisak meta
            za one koji ne žele da ciljaju prstom živi u profilnom popupu
            (components/BitkaBoardMenu.tsx). */}
        <BitkaMapPicker
          fill
          map={host.map}
          board={displayBoard}
          players={host.players}
          selectableIds={selectable}
          selectedId={chosen}
          activePlayerId={host.activePlayerId ?? null}
          onSelect={send}
          fxEvents={fxEvents}
        />
      </MapStage>
    );
  }

  // --- čekanje / gledanje --------------------------------------------------
  return (
    <MapStage
      top={
        <>
          {phase.startsWith('duel') && host.duel && (
            <DuelBanner host={host} me={me} seconds={seconds} />
          )}
          <Big>{waitTitle(phase, host, me, named)}</Big>
          {me?.lastOutcome && <Muted>{me.lastOutcome}</Muted>}
          {host.lastEvent && !me?.lastOutcome && !hostless && <Muted>{host.lastEvent}</Muted>}

          {/* Sa televizorom u sobi ovo bi bilo dupliranje — pitanje, ko je
              odgovorio i red čekanja stoje na TV-u. Bez njega ne stoje nigde. */}
          {hostless ? (
            <BitkaHostlessPanel host={host} phase={phase} myPlayerId={playerId} />
          ) : (
            <Reveal host={host} me={me} myPlayerId={playerId} />
          )}
        </>
      }
      bottom={
        hostless ? (
          <>
            {me?.myGuess != null && question?.kind === 'broj' && (
              <Muted>Tvoja procena: {me.myGuess}</Muted>
            )}
            <BitkaMiniStandings host={host} myPlayerId={playerId} />
          </>
        ) : undefined
      }
    >
      {/* Mapu vide SVI, ne samo hostless sobe. Ostale igre svesno ne dupliraju
          TV na telefonu, ali ovde je mapa ta koja se prati — bez nje igrač
          koji nije na potezu gleda samo tekst i ne zna gde se šta dešava.
          Uzima ceo ekran; tekst lebdi iznad nje. */}
      <BitkaMapPicker
        fill
        map={host.map}
        board={displayBoard}
        players={host.players}
        focusId={host.duel?.territoryId ?? null}
        activePlayerId={host.activePlayerId ?? null}
        fxEvents={fxEvents}
      />
    </MapStage>
  );
}

function waitTitle(
  phase: string,
  host: BitkaHostData,
  me: BitkaControllerData | undefined,
  named: (id: string | null | undefined) => string
): string {
  switch (phase) {
    case 'uvod':
      return `⚔️ ${host.map.name}`;
    case 'redosled-pitanje':
      return 'Pitanje stiže…';
    case 'redosled-rezultat':
      return 'Redosled je određen';
    case 'baza-izbor':
      // Zamkovi se dižu naizmenično, pa onaj ko čeka gleda tuđi potez.
      return me?.myBaseChoice
        ? 'Zamak je podignut ✓'
        : `${named(host.activePlayerId)} bira mesto za zamak`;
    case 'osvajanje-pitanje':
      return 'Spremi se…';
    case 'osvajanje-odgovor':
      return me?.hasAnswered ? 'Odgovor poslat ✓' : 'Odgovori na pitanje';
    case 'osvajanje-rezultat':
      return 'Rezultat';
    case 'osvajanje-izbor':
      return `${named(host.activePlayerId)} bira teritoriju`;
    case 'napad-izbor':
      return `${named(host.activePlayerId)} bira metu`;
    case 'duel-pitanje':
      return 'Duel počinje…';
    case 'duel-odgovor':
      return me?.hasAnswered ? 'Odgovor poslat ✓' : 'Duel u toku';
    case 'duel-broj':
      return me?.hasAnswered ? 'Zaključano ✓' : 'Nerešeno — broj odlučuje';
    case 'duel-rezultat':
      return 'Ishod napada';
    default:
      return 'Bitka traje';
  }
}

// --- sitni delovi ------------------------------------------------------------

/**
 * Ko koga napada i za koju teritoriju. Napadaču i braniocu piše iz njihovog
 * ugla („Napadaš Miku" / „Mika te napada"), posmatraču neutralno — bez toga
 * se sa telefona ne zna ko je u dvoboju.
 */
function DuelBanner({
  host,
  me,
  seconds,
}: {
  host: BitkaHostData;
  me: BitkaControllerData | undefined;
  seconds: number;
}) {
  const duel = host.duel!;
  const attacker = host.players.find((p) => p.playerId === duel.attackerId);
  const defender = host.players.find((p) => p.playerId === duel.defenderId);
  const place = host.map.territories.find((t) => t.id === duel.territoryId)?.name ?? '';
  const walls = host.board.find((st) => st.id === duel.territoryId)?.walls ?? 0;

  const line =
    me?.duelRole === 'napadac'
      ? defender
        ? `⚔️ Napadaš ${defender.name}`
        : '⚔️ Napadaš ničiju zemlju'
      : me?.duelRole === 'branilac'
        ? `🛡️ ${attacker?.name ?? 'Protivnik'} te napada`
        : `${attacker?.name ?? '?'} napada ${defender?.name ?? 'ničiju zemlju'}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        // Baner ostaje traka pune širine i kad ga centrirani sloj skuplja.
        width: '100%',
        textAlign: 'left',
        textShadow: 'none',
        padding: '0.55rem 0.7rem',
        borderRadius: '10px',
        background: 'var(--bg-card)',
        borderLeft: `4px solid ${
          me?.duelRole === 'branilac'
            ? (defender?.avatarColor ?? 'var(--accent)')
            : (attacker?.avatarColor ?? 'var(--accent)')
        }`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
        <strong style={{ fontSize: '0.95rem' }}>{line}</strong>
        <span
          style={{
            marginLeft: 'auto',
            fontWeight: 800,
            color: seconds <= 5 ? 'var(--danger)' : 'var(--text-secondary)',
          }}
        >
          {seconds}s
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span>za {place}</span>
        {duel.onCastle && (
          <>
            <span>· 🏰</span>
            <Walls walls={walls} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Mapa preko celog ekrana; tekst lebdi iznad nje.
 *
 * Mapa je pejzažna, telefon uspravan — ono što ostane iznad i ispod nje je
 * ionako prazna traka, pa naslovi i poruke idu tamo umesto da mapi oduzimaju
 * visinu. Slojevi ne primaju dodir da tap uvek stigne do mape ispod.
 */
function MapStage({
  top,
  bottom,
  children,
}: {
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // `fixed` a ne `relative`: #root ima 1rem paddinga oko svake igre, a ovde
    // mapa treba ceo ekran. Ostaje ispod profilnog dugmeta (zIndex 50).
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 0,
      }}
    >
      {children}
      {top && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(0.4rem + var(--safe-top, 0px))',
            left: '0.6rem',
            right: '0.6rem',
            display: 'flex',
            flexDirection: 'column',
            // Poruke idu na sredinu — u uglu izgledaju kao da su zaostale od
            // nekog drugog ekrana, a i mapa je centrirana pa se slažu.
            alignItems: 'center',
            textAlign: 'center',
            gap: '0.3rem',
            textShadow: '0 1px 6px rgba(0,0,0,0.85)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {top}
        </div>
      )}
      {bottom && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(0.5rem + var(--safe-bottom, 0px))',
            // Simetrične ivice: desno stoji profilno dugme, pa se isti razmak
            // ostavlja i levo — inače „centrirani" tekst ispadne malo ulevo.
            left: 'calc(3.8rem + var(--safe-left, 0px))',
            right: 'calc(3.8rem + var(--safe-right, 0px))',
            textShadow: '0 1px 6px rgba(0,0,0,0.85)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {bottom}
        </div>
      )}
    </div>
  );
}

/** Preostali zidovi zamka — puna pločica je zid koji još stoji. */
function Walls({ walls }: { walls: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: '3px' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '2px',
            boxSizing: 'border-box',
            background: i < walls ? '#F2CE74' : 'transparent',
            border: i < walls ? 'none' : '1px solid rgba(255,255,255,0.35)',
          }}
        />
      ))}
    </span>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.6rem',
        height: '100%',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.3 }}>
      {children}
    </p>
  );
}

/**
 * Tačan odgovor na upravo završeno pitanje.
 *
 * Ne gleda se faza nego prisustvo polja: server `correctIndex`/`correctValue`
 * šalje isključivo kad je pitanje gotovo. Otkad otkrivanje nema svoju fazu
 * (biranje kreće odmah), vezivanje za `*-rezultat` bi ga sakrilo baš onom
 * igraču koji je pogodio i sad bira.
 */
function Reveal({
  host,
  me,
  myPlayerId,
}: {
  host: BitkaHostData;
  me: BitkaControllerData | undefined;
  myPlayerId: string;
}) {
  const q = host.question;
  if (!q) return null;
  const line =
    q.kind === 'izbor' && host.correctIndex != null
      ? `Tačno: ${q.options?.[host.correctIndex]?.text ?? ''}`
      : q.kind === 'broj' && host.correctValue != null
        ? `Tačno: ${host.correctValue}${q.unit ? ` ${q.unit}` : ''}${
            me?.myGuess != null ? ` · ti: ${me.myGuess}` : ''
          }`
        : null;
  if (!line && !host.tiebreak) return null;
  return (
    <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--accent)' }}>
      {line}
      {/* Nerešen duel: ovo je jedini ekran na kome ga duelant vidi, jer mu se
          izborno pitanje namerno ne vraća preko mape. */}
      <BitkaTiebreak host={host} myPlayerId={myPlayerId} compact centered />
    </div>
  );
}

/** Preostalo vreme kao zasebna pločica ispod naslova — čitljivo i preko mape. */
function Seconds({ value }: { value: number }) {
  return (
    <span
      style={{
        padding: '0.15rem 0.6rem',
        borderRadius: '999px',
        background: 'rgba(0,0,0,0.45)',
        fontWeight: 800,
        fontSize: '0.95rem',
        textShadow: 'none',
        color: value <= 5 ? 'var(--danger)' : 'var(--text-primary)',
      }}
    >
      {value}s
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
      {children}
    </p>
  );
}

// Tabla sa poenima namerno NIJE ovde — živi u profilnom popupu
// (components/BitkaBoardMenu.tsx), jer se tokom partije prati mapa, ne brojke.
