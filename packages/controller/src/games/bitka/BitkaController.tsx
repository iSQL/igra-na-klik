import { useEffect, useRef, useState } from 'react';
import {
  BITKA_ZAMAK_BODOVI,
  deriveFxEvents,
  planFxHolds,
  territoryValue,
  type BitkaAnswerResult,
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
import { BitkaQuestionImage } from './components/BitkaQuestionImage';

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
  // Bez zasebnog završnog ekrana: `ended` je jedan broadcast pre nego što
  // platforma preuzme sa poenima i diplomama — ovo je samo prelazni kadar.
  if (phase === 'ended') {
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

  // Odbrojavanje do pitanja: server u ovim fazama ne šalje ni tekst pitanja,
  // pa se preko mape vrti samo brojač — svi otvore pitanje u istoj sekundi.
  const countdown = COUNTDOWN_LABEL[phase];

  // --- pitanja -------------------------------------------------------------
  const question = host.question;
  const answering =
    phase === 'osvajanje-odgovor' || phase === 'duel-odgovor';
  const guessing = phase === 'redosled-odgovor' || phase === 'duel-broj';
  const iAnswer = (host.expectedIds ?? []).includes(playerId);

  // Otkrivanje ostaje na ekranu PITANJA: tu se vidi ko je šta odabrao i šta je
  // tačno. Tek posle toga ide čist ekran za izbor teritorije.
  const revealing =
    phase === 'osvajanje-rezultat' ||
    phase === 'duel-odgovor-rezultat' ||
    phase === 'duel-rezultat';

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
        <BitkaQuestionImage url={question.imageUrl} maxHeight="28vh" />
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
        {/* Posledica se piše samo u osvajanju: tamo tačan odgovor odmah znači
            izbor teritorije. U duelu se ishod tek računa — ova faza je čisto
            otkrivanje, a ko je šta uzeo vidi se na mapi koja sledi. */}
        {revealing && (
          <Muted>
            {phase === 'osvajanje-rezultat'
              ? results.some((r) => r.playerId === playerId && r.correct)
                ? 'Pogodio si — biraš teritoriju.'
                : 'Nisi pogodio ovaj put.'
              : host.duel?.tiebreakPending
                ? 'Nerešeno — sledi broj.'
                : 'Ishod stiže na mapu…'}
          </Muted>
        )}
      </div>
    );
  }

  // Ko je poslao procenu ostaje na ekranu pitanja i gleda protivnika kako
  // zaključava. Dotad ga je vraćalo na mapu pa opet na pitanje čim drugi
  // odgovori — dva prelaza koji izgledaju kao da je nešto puklo.
  if (guessing && question?.kind === 'broj' && iAnswer && me?.hasAnswered) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.9rem', gap: '0.7rem' }}>
        {phase === 'duel-broj' && host.duel ? (
          <DuelBanner host={host} me={me} seconds={seconds} />
        ) : (
          <Muted>Procena poslata · {seconds}s</Muted>
        )}
        <BrojCekanje host={host} me={me} myPlayerId={playerId} />
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

  /**
   * Otkrivanje broja koji je razrešio nerešen duel — duelanti ostaju na svom
   * ekranu još koji trenutak, umesto da klizač nestane bez ijedne cifre.
   * Tačna vrednost, obe procene i ko je bio brži stoje na jednom mestu; mapa i
   * animacija uzimanja zemlje dolaze tek posle.
   */
  if (phase === 'duel-broj-rezultat' && question?.kind === 'broj' && iAnswer) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.9rem', gap: '0.7rem' }}>
        {host.duel && <DuelBanner host={host} me={me} seconds={seconds} />}
        <BrojOtkrivanje host={host} myPlayerId={playerId} />
      </div>
    );
  }

  /**
   * Posmatrač duela dobija isto pitanje preko celog ekrana — bez dugmadi.
   *
   * Dotad je onaj ko nije u duelu gledao mapu i jedan red teksta, pa nije znao
   * ni šta se pita ni koliko je ostalo; u sobi od četvoro to je pola stola koji
   * čeka. Pitanje i ponuđeni odgovori ionako stižu u broadcast polovini stanja
   * (tačan odgovor ne), pa se ovde ne otkriva ništa novo. Ishod se i dalje
   * gleda na mapi — ovaj ekran nestaje čim duel bude rešen.
   */
  if (
    (phase === 'duel-odgovor' ||
      phase === 'duel-broj' ||
      // Otkrivanje gleda i onaj ko nije u duelu — dotad mu je ekran nestajao
      // baš u trenutku kad se saznaje šta je bilo tačno.
      phase === 'duel-odgovor-rezultat' ||
      phase === 'duel-broj-rezultat') &&
    host.duel &&
    !iAnswer
  ) {
    return (
      <DuelSpectator
        host={host}
        phase={phase}
        seconds={seconds}
        hostless={hostless}
        myPlayerId={playerId}
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

  // Najava duela stoji CELU `duel-pitanje` fazu — najava i odbrojavanje su
  // jedna kartica (krug broji u njoj), kao i na TV-u. Nastavak opsade ne
  // dobija najavu (ista poruka po treći put u istom napadu je šum) — njemu
  // ostaje sam brojač.
  const najavaUp = phase === 'duel-pitanje' && !!host.duel && !host.duel.opsadaNastavak;

  // --- čekanje / gledanje --------------------------------------------------
  return (
    <MapStage
      overlay={
        phase === 'duel-ishod' && host.duel?.pendingOutcome ? (
          <DuelIshodCard host={host} me={me} />
        ) : najavaUp && host.duel ? (
          <DuelNajavaCard host={host} me={me} seconds={seconds} />
        ) : undefined
      }
      // Brojač je namerno providan i bez zatamnjenja: mapa se kroz njega vidi,
      // jer se u toj pauzi i dalje prati gde se šta dešava.
      center={
        countdown && !najavaUp ? (
          <Odbrojavanje
            seconds={seconds}
            label={
              phase === 'duel-pitanje' && host.duel?.opsadaNastavak
                ? 'Opsada se nastavlja'
                : countdown
            }
          />
        ) : (
          // Ko šta radi i šta se upravo desilo — dotad sitan red teksta u
          // vrhu, preko šarene mape jedva čitljiv. U fazama izbora kartica
          // nosi i krug sa preostalim vremenom — jedina Objava u kadru.
          // `duel-rezultat` je izuzet: tu se gleda animacija preuzimanja i
          // ništa ne sme preko nje.
          <StatusCard
            overline={WAIT_OVERLINE[phase]}
            seconds={WAIT_OVERLINE[phase] ? seconds : undefined}
            title={waitTitle(phase, host, me, named)}
            line={me?.lastOutcome ?? (hostless ? undefined : host.lastEvent)}
            muted={phase === 'duel-rezultat'}
          />
        )
      }
      top={
        <>
          {phase.startsWith('duel') && host.duel && (
            <DuelBanner host={host} me={me} seconds={seconds} />
          )}
          {phase === 'duel-rezultat' && me?.lastOutcome && <Muted>{me.lastOutcome}</Muted>}

          {/* Sa televizorom u sobi ovo bi bilo dupliranje — pitanje, ko je
              odgovorio i red čekanja stoje na TV-u. Bez njega ne stoje nigde. */}
          {hostless ? (
            <BitkaHostlessPanel host={host} phase={phase} myPlayerId={playerId} />
          ) : (
            <Reveal host={host} me={me} />
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
      return '';
    case 'redosled-rezultat':
      return 'Redosled je određen';
    case 'baza-izbor':
      // Zamkovi se dižu naizmenično, pa onaj ko čeka gleda tuđi potez.
      return me?.myBaseChoice
        ? 'Zamak je podignut ✓'
        : `${named(host.activePlayerId)} bira mesto za zamak`;
    case 'osvajanje-pitanje':
      return '';
    case 'osvajanje-odgovor':
      return me?.hasAnswered ? 'Odgovor poslat ✓' : 'Odgovori na pitanje';
    case 'osvajanje-rezultat':
      return 'Rezultat';
    case 'osvajanje-izbor':
      // Ista rečenica kao na TV-u i u hostless traci — jedan potez, jedan tekst.
      return `${named(host.activePlayerId)} bira slobodnu teritoriju`;
    case 'napad-izbor':
      return `${named(host.activePlayerId)} bira metu`;
    // U ovim fazama naslov nosi sam brojač preko mape.
    case 'duel-pitanje':
      return '';
    case 'duel-odgovor':
      return me?.hasAnswered ? 'Odgovor poslat ✓' : 'Duel u toku';
    case 'duel-odgovor-rezultat':
      return 'Tačan odgovor';
    case 'duel-broj':
      return me?.hasAnswered ? 'Zaključano ✓' : 'Nerešeno — broj odlučuje';
    case 'duel-broj-rezultat':
      return 'Ko je bio bliži?';
    // Ishod nosi prozor preko ekrana; naslov ispod njega bi bio isti tekst dvaput.
    case 'duel-ishod':
      return '';
    case 'duel-rezultat':
      return 'Ishod napada';
    default:
      return 'Bitka traje';
  }
}

// --- sitni delovi ------------------------------------------------------------

/**
 * Naslovi faza koje su samo odbrojavanje do pitanja. Ključ postoji tačno za
 * one faze u kojima server pitanje NE šalje.
 */
const COUNTDOWN_LABEL: Record<string, string> = {
  'redosled-pitanje': 'Ko bira prvi?',
  'osvajanje-pitanje': 'Pitanje stiže',
  'duel-pitanje': 'Duel počinje',
};

/**
 * Nadnaslov centralne kartice u fazama izbora — uz njega ide i krug sa
 * preostalim vremenom, pa je kartica jedina Objava u kadru (ista rečenica se
 * ne ponavlja ni u hostless traci, ni u zaglavlju).
 */
const WAIT_OVERLINE: Record<string, string> = {
  'baza-izbor': 'Podizanje zamkova',
  'osvajanje-izbor': 'Biranje teritorije',
  'napad-izbor': 'Izbor mete',
};

/**
 * Brojač preko mape dok se čeka pitanje.
 *
 * Dotad je u toj pauzi iznad mape stajao tekst pitanja, pa se isto pitanje
 * čitalo dvaput — sitno preko mape, pa opet preko celog ekrana. Sad se vidi
 * samo koliko je ostalo do otvaranja.
 */
function Odbrojavanje({ seconds, label }: { seconds: number; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          fontSize: '0.8rem',
          fontWeight: 800,
          color: '#F2CE74',
          textShadow: '0 1px 8px rgba(0,0,0,0.9)',
        }}
      >
        {label}
      </span>
      <span
        // Ključ je sam broj: element se svake sekunde zameni novim, pa se
        // ulazna animacija odigra ponovo bez ijednog dodatnog tajmera.
        key={seconds}
        className="bitka-odbrojavanje"
        style={{
          width: '6.5rem',
          height: '6.5rem',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(9,20,36,0.5)',
          border: '3px solid rgba(242,206,116,0.6)',
          boxShadow: '0 0 40px rgba(242,206,116,0.25)',
          fontFamily: 'var(--font-display)',
          fontSize: '3.4rem',
          fontWeight: 800,
          lineHeight: 1,
          color: '#F2CE74',
          textShadow: 'none',
        }}
      >
        {seconds}
      </span>
    </div>
  );
}

/**
 * Naslov faze i poslednji događaj, centrirano preko mape u providnoj pločici.
 *
 * Mapa je šarena i preko nje se sitan tekst u vrhu ekrana jednostavno gubi —
 * a baš tu piše ko je na potezu i šta se upravo desilo. Pločica ne prima
 * dodir, pa mapa ispod ostaje potpuno upotrebljiva.
 */
function StatusCard({
  title,
  line,
  overline,
  seconds,
  muted,
}: {
  title: string;
  line?: string;
  /** Nadnaslov mini-Objave — „Biranje teritorije", „Izbor mete"… */
  overline?: string;
  /** Krug sa preostalim vremenom — u fazama izbora sat živi ovde, ne u uglu. */
  seconds?: number;
  /** Kad se ispod igra animacija — tada ništa ne sme na sredinu. */
  muted?: boolean;
}) {
  if (muted || (!title && !line)) return null;
  return (
    <div
      style={{
        maxWidth: '88%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '1rem 1.1rem',
        borderRadius: '18px',
        background: 'rgba(9,20,36,0.56)',
        border: '1px solid rgba(242,206,116,0.4)',
        textAlign: 'center',
        textShadow: 'none',
        pointerEvents: 'none',
      }}
    >
      {seconds != null && (
        <span
          // Ključ je sam broj — na svaku sekundu uskoči nov, kao u brojaču.
          key={seconds}
          className="bitka-odbrojavanje"
          style={{
            width: '4.6rem',
            height: '4.6rem',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(9,20,36,0.5)',
            border: '3px solid rgba(242,206,116,0.6)',
            fontFamily: 'var(--font-display)',
            fontSize: '2.1rem',
            fontWeight: 800,
            lineHeight: 1,
            color: '#F2CE74',
          }}
        >
          {seconds}
        </span>
      )}
      {overline && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            fontSize: '0.68rem',
            color: '#F2CE74',
          }}
        >
          {overline}
        </span>
      )}
      {title && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            fontWeight: 800,
            lineHeight: 1.2,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </span>
      )}
      {line && (
        <span style={{ fontSize: '0.88rem', color: '#F2CE74', fontWeight: 700 }}>{line}</span>
      )}
    </div>
  );
}

/** Ikona i boja ishoda — isti rečnik koji TV koristi u svom prozoru. */
const ISHOD_GLYPH: Record<string, { glyph: string; color: string; label: string }> = {
  napadac: { glyph: '⚔️', color: '#F2CE74', label: 'Teritorija je pala' },
  branilac: { glyph: '🛡️', color: '#7fd1a3', label: 'Odbrana je izdržala' },
  zid: { glyph: '🧱', color: '#F2CE74', label: 'Zid je srušen' },
  'zamak-pao': { glyph: '🏰', color: '#e06a5e', label: 'Zamak je pao' },
};

/**
 * Prozor sa ishodom napada — isti trenutak kao na TV-u.
 *
 * Server posledicu upisuje tek kad ovaj prozor istekne, pa mapa ispod još
 * pokazuje staro stanje; animacije preuzimanja kreću posle njega.
 */
function DuelIshodCard({
  host,
  me,
}: {
  host: BitkaHostData;
  me: BitkaControllerData | undefined;
}) {
  const duel = host.duel!;
  const look = ISHOD_GLYPH[duel.pendingOutcome!] ?? ISHOD_GLYPH.napadac;
  const walls = duel.wallsAfter ?? host.board.find((x) => x.id === duel.territoryId)?.walls ?? 0;

  return (
    <div
      className="bitka-najava"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.7rem',
        padding: '1.4rem 1rem',
        borderRadius: '20px',
        background: 'var(--bg-card)',
        border: `1px solid ${look.color}`,
        boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
        textAlign: 'center',
        textShadow: 'none',
      }}
    >
      <span style={{ fontSize: '2.8rem', lineHeight: 1 }}>{look.glyph}</span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontSize: '0.72rem',
          color: look.color,
        }}
      >
        {look.label}
      </span>
      <strong style={{ fontSize: '1.15rem', lineHeight: 1.3 }}>{host.lastEvent}</strong>
      {duel.onCastle && duel.pendingOutcome !== 'zamak-pao' && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>zidovi</span>
          <Walls walls={walls} />
        </span>
      )}
      {/* Šta ishod znači baš za mene — napadaču i braniocu ne znači isto. */}
      {me?.lastOutcome && (
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {me.lastOutcome}
        </span>
      )}
    </div>
  );
}

/**
 * Ekran posle poslate procene: pitanje ostaje, uz svoju procenu i to ko je od
 * ostalih već zaključao. Nikad tuđa procena — ona se otkriva tek u rezultatu.
 */
function BrojCekanje({
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
  const answered = new Set(host.answeredIds ?? []);
  const others = (host.expectedIds ?? []).filter((id) => id !== myPlayerId);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '0.9rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.3 }}>{q.text}</p>
      <BitkaQuestionImage url={q.imageUrl} maxHeight="20vh" />
      <div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Tvoja procena</div>
        <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1.1 }}>
          {me?.myGuess ?? '—'}
          {q.unit ? <span style={{ fontSize: '1.1rem' }}> {q.unit}</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
        {others.map((id) => {
          const p = host.players.find((x) => x.playerId === id);
          if (!p) return null;
          const done = answered.has(id);
          return (
            <span
              key={id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '999px',
                background: 'var(--bg-card)',
                border: done ? '1px solid var(--success)' : '1px dashed var(--line2)',
                opacity: done ? 1 : 0.7,
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              <span>{p.avatarEmoji}</span>
              <span>{p.name}</span>
              <span style={{ color: done ? 'var(--success)' : 'var(--text-secondary)' }}>
                {done ? 'zaključao ✓' : 'razmišlja…'}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Otkrivanje broja iz nerešenog duela — tačna vrednost i obe procene, poređane
 * po blizini, sa vremenom potvrde. Brzina je i pravilo: kad su procene jednako
 * daleko, zemlju uzima brži.
 */
function BrojOtkrivanje({ host, myPlayerId }: { host: BitkaHostData; myPlayerId: string }) {
  const q = host.question;
  if (!q || host.correctValue == null) return null;
  const unit = q.unit ? ` ${q.unit}` : '';
  const rows = (host.results ?? [])
    .map((r) => ({ r, p: host.players.find((x) => x.playerId === r.playerId) }))
    .filter((row): row is { r: BitkaAnswerResult; p: BitkaPlayerView } => !!row.p)
    .sort((a, b) => {
      const da = a.r.value == null ? Infinity : Math.abs(a.r.value - host.correctValue!);
      const db = b.r.value == null ? Infinity : Math.abs(b.r.value - host.correctValue!);
      return da - db;
    });

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '0.8rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.3 }}>{q.text}</p>
      <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent)' }}>
        {host.correctValue}
        {unit}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {rows.map(({ r, p }, i) => {
          const best = i === 0 && r.value != null;
          return (
            <div
              key={p.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.7rem',
                borderRadius: '12px',
                background: 'var(--bg-card)',
                border: `2px solid ${best ? 'var(--success)' : 'var(--line2)'}`,
                opacity: r.value == null ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>{p.avatarEmoji}</span>
              <strong style={{ fontSize: '0.95rem' }}>
                {p.playerId === myPlayerId ? 'ti' : p.name}
              </strong>
              <span style={{ marginLeft: 'auto', fontWeight: 800 }}>
                {r.value == null ? 'nije stigao' : `${r.value}${unit}`}
              </span>
              {/* Brzina nije ukras: kod jednakog promašaja ona deli zemlju. */}
              {r.seconds != null && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {r.seconds}s
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  overlay,
  center,
  children,
}: {
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  /** Sloj preko svega, sa zatamnjenjem — zasad samo najava napada. */
  overlay?: React.ReactNode;
  /** Centrirani sloj BEZ zatamnjenja — mapa ostaje da se vidi kroz njega. */
  center?: React.ReactNode;
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
      {center && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          {center}
        </div>
      )}
      {overlay && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            padding: '1.1rem 10%',
            background: 'rgba(9,20,36,0.72)',
            backdropFilter: 'blur(3px) saturate(0.7)',
            WebkitBackdropFilter: 'blur(3px) saturate(0.7)',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          {overlay}
        </div>
      )}
    </div>
  );
}

/**
 * Najava duela na telefonu — ista Objava koju TV baci preko table, samo
 * uspravna. Stoji celu `duel-pitanje` fazu: krug u njoj odbrojava do pitanja,
 * pa najava i brojač nikad nisu dve stvari preko iste mape.
 *
 * Opsada boji karticu u crveno — jedini napad koji izbacuje igrača iz partije.
 * Duelantima poslednji red piše iz njihovog ugla („Napadaš Miku" / „Mika te
 * napada"), posmatraču da pitanje stiže i njemu — inače bi kartica izgledala
 * kao poruka koja se njega ne tiče.
 */
function DuelNajavaCard({
  host,
  me,
  seconds,
}: {
  host: BitkaHostData;
  me: BitkaControllerData | undefined;
  seconds: number;
}) {
  const duel = host.duel!;
  const siege = duel.onCastle;
  const attacker = host.players.find((p) => p.playerId === duel.attackerId);
  const defender = host.players.find((p) => p.playerId === duel.defenderId);
  const territory = host.map.territories.find((t) => t.id === duel.territoryId);
  const st = host.board.find((x) => x.id === duel.territoryId);
  const walls = st?.walls ?? 0;
  const value = st?.castle ? BITKA_ZAMAK_BODOVI : territoryValue(territory ?? {});
  const foot =
    me?.duelRole === 'napadac'
      ? defender
        ? `Napadaš ${defender.name}.`
        : 'Napadaš ničiju zemlju.'
      : me?.duelRole === 'branilac'
        ? `${attacker?.name ?? 'Protivnik'} te napada.`
        : 'Gledaš — pitanje stiže i tebi.';

  return (
    <div
      className="bitka-najava"
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.9rem',
        padding: '1.3rem 1rem',
        borderRadius: '20px',
        background: 'var(--bg-card)',
        border: `1px solid ${siege ? 'var(--danger)' : 'rgba(242,206,116,0.55)'}`,
        boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
        textShadow: 'none',
      }}
    >
      <span className="bitka-sheen" />
      <span
        // Krug odbrojava u samoj najavi — TV i telefon broje isti serverski sat.
        key={seconds}
        className="bitka-odbrojavanje"
        style={{
          width: '4.4rem',
          height: '4.4rem',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(9,20,36,0.5)',
          border: `3px solid ${siege ? 'rgba(224,106,94,0.75)' : 'rgba(242,206,116,0.6)'}`,
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          fontWeight: 800,
          lineHeight: 1,
          color: siege ? '#f0b3ab' : '#F2CE74',
        }}
      >
        {seconds}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          fontSize: '0.78rem',
          color: siege ? '#f0b3ab' : '#F2CE74',
        }}
      >
        {siege ? '🏰 Opsada zamka' : defender ? 'Duel počinje' : 'Pohod na ničiju zemlju'}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', width: '100%' }}>
        <NajavaRow player={attacker} role="napada" glyph="⚔️" />
        {defender && (
          <NajavaRow player={defender} role={duel.onCastle ? 'brani zamak' : 'brani'} />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
          padding: '0.45rem 0.9rem',
          borderRadius: '999px',
          background: siege ? 'rgba(224,106,94,0.16)' : 'rgba(242,206,116,0.14)',
          border: `1px solid ${siege ? 'rgba(224,106,94,0.45)' : 'rgba(242,206,116,0.4)'}`,
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>{st?.castle ? '🏰' : '🚩'}</span>
        <span
          style={{
            fontWeight: 800,
            fontSize: '1.05rem',
            color: siege ? '#f0b3ab' : '#F2CE74',
          }}
        >
          {territory?.name ?? ''}
        </span>
        {siege && <Walls walls={walls} />}
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>· {value}</span>
      </div>

      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        {foot}
      </span>
    </div>
  );
}

function NajavaRow({
  player,
  role,
  glyph,
}: {
  player?: BitkaPlayerView;
  role: string;
  glyph?: string;
}) {
  if (!player) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%' }}>
      <span
        style={{
          width: '2.6rem',
          height: '2.6rem',
          borderRadius: '50%',
          background: player.avatarColor,
          display: 'grid',
          placeItems: 'center',
          fontSize: '1.35rem',
          flexShrink: 0,
        }}
      >
        {player.avatarEmoji}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>{player.name}</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{role}</span>
      </div>
      {glyph && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '1.6rem',
            filter: 'drop-shadow(0 0 14px rgba(242,206,116,0.7))',
          }}
        >
          {glyph}
        </span>
      )}
    </div>
  );
}

/**
 * Duel iz ugla onoga ko ga ne igra: isto pitanje, iste ponuđene opcije, samo
 * bez dugmadi.
 *
 * Opcije su namerno obična polja a ne onemogućena dugmad — da nijednom prstu
 * ne padne na pamet da su „zaglavila". Ko je zaključao odgovor vidi se iz dve
 * zastavice koje server ionako emituje; ŠTA je ko izabrao ne stiže dovde.
 */
function DuelSpectator({
  host,
  phase,
  seconds,
  hostless,
  myPlayerId,
}: {
  host: BitkaHostData;
  phase: string;
  seconds: number;
  hostless: boolean;
  myPlayerId: string;
}) {
  const duel = host.duel!;
  const q = host.question;
  // Isto otkrivanje koje gledaju duelanti — posmatraču je ono i jedina prilika
  // da vidi zašto je zemlja otišla kome je otišla.
  const revealing = phase.endsWith('-rezultat');
  const results = host.results ?? [];
  const attacker = host.players.find((p) => p.playerId === duel.attackerId);
  const defender = host.players.find((p) => p.playerId === duel.defenderId);
  const territory = host.map.territories.find((t) => t.id === duel.territoryId);
  const st = host.board.find((x) => x.id === duel.territoryId);
  const walls = st?.walls ?? 0;
  const value = st?.castle ? BITKA_ZAMAK_BODOVI : territoryValue(territory ?? {});

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.9rem',
        gap: '0.7rem',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.7rem',
          borderRadius: '10px',
          background: 'var(--bg-card)',
          borderLeft: `4px solid ${attacker?.avatarColor ?? 'var(--accent)'}`,
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#F2CE74',
            fontWeight: 800,
          }}
        >
          Gledaš
        </span>
        <strong style={{ fontSize: '0.95rem' }}>
          {attacker?.name ?? '?'} ⚔ {defender?.name ?? 'ničija zemlja'}
        </strong>
        {!revealing && (
          <span
            className={seconds <= 10 ? 'bitka-tick' : undefined}
            style={{
              marginLeft: 'auto',
              fontWeight: 800,
              fontSize: '1.4rem',
              color: seconds <= 5 ? 'var(--danger)' : 'var(--text-secondary)',
            }}
          >
            {seconds}s
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span>za {territory?.name ?? ''}</span>
        {duel.onCastle && (
          <>
            <span>· 🏰</span>
            <Walls walls={walls} />
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>{value} poena</span>
      </div>

      {q && (
        <p style={{ margin: '0.2rem 0 0', fontSize: '1.3rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.3 }}>
          {q.text}
        </p>
      )}
      <BitkaQuestionImage url={q?.imageUrl} maxHeight="22vh" />

      {q?.kind === 'izbor' && q.options ? (
        <div style={{ display: 'grid', gap: '0.7rem', flex: 1, gridAutoRows: '1fr' }}>
          {q.options.map((o) => {
            const right = revealing && host.correctIndex === o.index;
            const takers = revealing
              ? results
                  .filter((r) => r.optionIndex === o.index)
                  .map((r) => host.players.find((pp) => pp.playerId === r.playerId))
                  .filter((pp): pp is BitkaPlayerView => !!pp)
              : [];
            return (
              <span
                key={o.index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.9rem 1rem',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: '#fff',
                  background: right ? 'var(--success)' : o.color,
                  border: right ? '3px solid #fff' : '3px solid transparent',
                  borderRadius: '14px',
                  opacity: revealing ? (right ? 1 : 0.35) : 0.78,
                }}
              >
                {right && <span>✓</span>}
                <span style={{ flex: 1 }}>{o.text}</span>
                {takers.map((pp) => (
                  <span
                    key={pp.playerId}
                    style={{
                      width: '1.7rem',
                      height: '1.7rem',
                      borderRadius: '50%',
                      background: pp.avatarColor,
                      border: '2px solid rgba(0,0,0,0.3)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '0.9rem',
                      flexShrink: 0,
                    }}
                  >
                    {pp.avatarEmoji}
                  </span>
                ))}
              </span>
            );
          })}
        </div>
      ) : revealing && q?.kind === 'broj' ? (
        <BrojOtkrivanje host={host} myPlayerId={myPlayerId} />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
          }}
        >
          <Big>Nerešeno — broj odlučuje</Big>
          {q?.kind === 'broj' && (
            <Muted>
              Opseg {q.min}–{q.max}
              {q.unit ? ` ${q.unit}` : ''} · bliži uzima zemlju
            </Muted>
          )}
        </div>
      )}

      {/* U otkrivanju zaključavanje više ništa ne kaže — avatari tada sede na
          samim opcijama, odnosno na procenama. */}
      {!revealing && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <CommitChip player={attacker} committed={duel.attackerCommitted} />
          {defender && <CommitChip player={defender} committed={duel.defenderCommitted} />}
        </div>
      )}
      {hostless && <BitkaMiniStandings host={host} myPlayerId={myPlayerId} />}
      {/* Profilno dugme sedi u donjem desnom uglu — poslednji red mu se sklanja
          sa puta, inače mu poruka prolazi ispod. */}
      <div style={{ padding: '0 3.4rem' }}>
        <Muted>
          {duel.tiebreakPending
            ? 'Nerešeno — odlučiće broj.'
            : 'Ne igraš ovaj duel — ishod se vraća na mapu.'}
        </Muted>
      </div>
    </div>
  );
}

/** „Zaključao ✓" bez otkrivanja šta je izabrao. */
function CommitChip({ player, committed }: { player?: BitkaPlayerView; committed: boolean }) {
  if (!player) return null;
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.45rem 0.6rem',
        borderRadius: '999px',
        background: committed ? 'rgba(87,179,128,0.16)' : 'rgba(245,235,224,0.06)',
        border: committed ? '1px solid var(--success)' : '1px dashed var(--line2)',
      }}
    >
      <span
        style={{
          width: '1.5rem',
          height: '1.5rem',
          borderRadius: '50%',
          background: player.avatarColor,
          display: 'grid',
          placeItems: 'center',
          fontSize: '0.8rem',
          flexShrink: 0,
        }}
      >
        {player.avatarEmoji}
      </span>
      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.name}</span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: '0.75rem',
          fontWeight: 800,
          color: committed ? 'var(--success)' : 'var(--text-secondary)',
        }}
      >
        {committed ? '✓' : '…'}
      </span>
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
}: {
  host: BitkaHostData;
  me: BitkaControllerData | undefined;
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
  if (!line) return null;
  return <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--accent)' }}>{line}</div>;
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
