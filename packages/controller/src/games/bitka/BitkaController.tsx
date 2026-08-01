import { useState } from 'react';
import type { BitkaControllerData, BitkaHostData, BitkaPlayerView } from '@igra/shared';
import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { useHaptics } from '../../hooks/useHaptics';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { BrojSlider } from '../quiz/components/BrojSlider';
import { BitkaMapPicker } from './components/BitkaMapPicker';

function act(action: string, data: Record<string, unknown> = {}) {
  socket.emit('game:player-action', { action, data });
}

export default function BitkaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const haptics = useHaptics();
  const [draft, setDraft] = useState<string | null>(null);

  if (!gameState || !playerId) return null;
  const host = gameState.data.host as BitkaHostData | undefined;
  if (!host) return null;
  const me = gameState.playerData[playerId] as unknown as BitkaControllerData | undefined;
  const phase = gameState.phase;
  const seconds = gameState.timeRemaining;

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
      <Center>
        <Big>🏳️ Ispao si iz bitke</Big>
        <Muted>Zamak ti je pao. Gledaj kako se ostali dovršavaju.</Muted>
        {hostless && <Board host={host} />}
      </Center>
    );
  }

  // --- pitanja -------------------------------------------------------------
  const question = host.question;
  const answering =
    phase === 'osvajanje-odgovor' || phase === 'duel-odgovor';
  const guessing = phase === 'redosled-odgovor' || phase === 'duel-broj';
  const iAnswer = (host.expectedIds ?? []).includes(playerId);

  if (answering && question?.kind === 'izbor' && iAnswer) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.9rem', gap: '0.7rem' }}>
        {phase === 'duel-odgovor' && host.duel ? (
          <DuelBanner host={host} me={me} seconds={seconds} />
        ) : (
          <Muted>Osvajanje · {seconds}s</Muted>
        )}
        <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.3 }}>
          {question.text}
        </p>
        <div style={{ display: 'grid', gap: '0.6rem', flex: 1, alignContent: 'center' }}>
          {(question.options ?? []).map((o) => {
            const picked = me?.selectedIndex === o.index;
            return (
              <button
                key={o.index}
                disabled={me?.hasAnswered}
                onClick={() => {
                  haptics.success();
                  act('bitka:answer', { optionIndex: o.index });
                }}
                style={{
                  padding: '1.1rem',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: '#fff',
                  background: o.color,
                  border: picked ? '3px solid var(--text-primary)' : '3px solid transparent',
                  borderRadius: '14px',
                  opacity: me?.hasAnswered && !picked ? 0.4 : 1,
                }}
              >
                {o.text}
              </button>
            );
          })}
        </div>
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
    const chosen = phase === 'baza-izbor' ? (me!.myBaseChoice ?? draft) : draft;
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.7rem', gap: '0.6rem', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <strong style={{ fontSize: '1.05rem' }}>{title}</strong>
          <span style={{ marginLeft: 'auto', color: seconds <= 5 ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 800 }}>
            {seconds}s
          </span>
        </div>
        <BitkaMapPicker
          map={host.map}
          board={host.board}
          players={host.players}
          selectableIds={selectable}
          selectedId={chosen}
          onSelect={send}
          maxHeightCss="40dvh"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))', gap: '0.4rem' }}>
          {selectable.map((id) => (
            <button
              key={id}
              onClick={() => send(id)}
              style={{
                padding: '0.7rem 0.5rem',
                fontWeight: 800,
                borderRadius: '10px',
                border: chosen === id ? '2px solid var(--accent)' : '1px solid var(--line2)',
                background: chosen === id ? 'rgba(194,155,71,0.2)' : 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            >
              {territoryName(id)}
            </button>
          ))}
        </div>
        {phase === 'baza-izbor' && chosen && (
          <Muted>Izabrao si {territoryName(chosen)}. Možeš da promeniš dok vreme teče.</Muted>
        )}
      </div>
    );
  }

  // --- čekanje / gledanje --------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.9rem', gap: '0.7rem', overflow: 'auto' }}>
      {phase.startsWith('duel') && host.duel && (
        <DuelBanner host={host} me={me} seconds={seconds} />
      )}
      <Big>{waitTitle(phase, host, me, named)}</Big>
      {me?.lastOutcome && <Muted>{me.lastOutcome}</Muted>}
      {host.lastEvent && !me?.lastOutcome && <Muted>{host.lastEvent}</Muted>}

      {phase.endsWith('-rezultat') && question?.kind === 'izbor' && host.correctIndex != null && (
        <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--accent)' }}>
          Tačno: {question.options?.[host.correctIndex]?.text ?? ''}
        </div>
      )}
      {phase.endsWith('-rezultat') && question?.kind === 'broj' && host.correctValue != null && (
        <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--accent)' }}>
          Tačno: {host.correctValue}
          {question.unit ? ` ${question.unit}` : ''}
          {me?.myGuess != null ? ` · ti: ${me.myGuess}` : ''}
        </div>
      )}

      {(hostless || phase === 'uvod') && (
        <BitkaMapPicker
          map={host.map}
          board={host.board}
          players={host.players}
          focusId={host.duel?.territoryId ?? null}
          maxHeightCss="36dvh"
        />
      )}
      {hostless && <Board host={host} />}
    </div>
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
      return me?.myBaseChoice ? 'Izbor poslat' : 'Biraj zamak na mapi';
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

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
      {children}
    </p>
  );
}

/** Mala tabla za hostless sobe — telefon je jedini ekran. */
function Board({ host }: { host: BitkaHostData }) {
  const sorted: BitkaPlayerView[] = [...host.players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {sorted.map((p) => (
        <div
          key={p.playerId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.7rem',
            borderRadius: '10px',
            background: 'var(--bg-card)',
            borderLeft: `4px solid ${p.avatarColor}`,
            opacity: p.eliminated ? 0.45 : 1,
          }}
        >
          <span>{p.avatarEmoji}</span>
          <span style={{ flex: 1, fontWeight: 700 }}>{p.name}</span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            {p.eliminated ? 'ispao' : <>{p.territories} ter. · <Walls walls={p.walls} /></>}
          </span>
          <strong style={{ color: 'var(--accent)' }}>{p.score}</strong>
        </div>
      ))}
    </div>
  );
}
