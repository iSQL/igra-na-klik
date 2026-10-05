import { useEffect, type ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { GameFrame } from '../../components/kit/GameFrame';
import { RoundVerdict, verdictWash } from '../../components/kit/RoundVerdict';
import { AnswerButtons } from '../quiz/components/AnswerButtons';
import { vibrate } from '../../utils/cues';
import type {
  HotPotatoControllerData,
  HotPotatoHostData,
  HotPotatoPlayerLite,
  QuizOption,
} from '@igra/shared';

/** Mirror the server's kviz timers — they only drive the drain bar. */
const KVIZ_ANSWER_SECONDS = 5;
const KVIZ_PICK_SECONDS = 10;

/** Holding the potato: a soft buzz every so often until it's passed on. */
const HOLD_BUZZ_MS = 900;

const HOT_BG =
  'radial-gradient(520px 420px at 50% 38%, rgba(227,180,94,.6), transparent 70%), #7a3a1f';

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '0.8rem',
  textAlign: 'center',
  padding: '1rem 0',
};

function pass(targetId?: string) {
  socket.emit('game:player-action', {
    action: 'potato:pass',
    data: targetId ? { targetId } : {},
  });
}

export default function HotPotatoController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  const phase = gameState?.phase;
  const host = gameState?.data.host as HotPotatoHostData | undefined;
  const isHolder = !!host && !!playerId && host.holderId === playerId;
  const hot = isHolder && (phase === 'passing' || phase === 'question');

  // Continuous soft vibration while the potato is in your hands.
  useEffect(() => {
    if (!hot) return;
    vibrate(40);
    const timer = setInterval(() => vibrate(40), HOLD_BUZZ_MS);
    return () => {
      clearInterval(timer);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(0);
    };
  }, [hot]);

  if (!gameState || !playerId || !host) return null;

  const timeRemaining = gameState.timeRemaining;
  const timed = phase === 'question' || phase === 'picking';
  const subtitle =
    host.mode === 'kviz'
      ? `Kviz · ${host.aliveCount} u igri`
      : `${host.category ? host.category + ' · ' : ''}${host.aliveCount} u igri`;

  return (
    <>
      {/* The hot screen covers the whole phone, header included. */}
      {hot && (
        <div
          aria-hidden
          style={{ position: 'fixed', inset: 0, zIndex: 0, background: HOT_BG, pointerEvents: 'none' }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        <GameFrame
          gameId="hot-potato"
          subtitle={phase === 'ended' || phase === 'final-leaderboard' ? 'Kraj igre' : subtitle}
          timeRemaining={timed ? timeRemaining : undefined}
          timeTotal={
            phase === 'question' ? KVIZ_ANSWER_SECONDS : phase === 'picking' ? KVIZ_PICK_SECONDS : undefined
          }
          roundKey={phase === 'question' ? host.question?.text : undefined}
        >
          <Body playerId={playerId} hostless={hostless} />
        </GameFrame>
      </div>
    </>
  );
}

function Body({ playerId, hostless }: { playerId: string; hostless: boolean }) {
  const gameState = useGameStore((s) => s.gameState)!;
  const { phase, data, playerData } = gameState;
  const host = data.host as HotPotatoHostData;
  const my = playerData[playerId] as unknown as HotPotatoControllerData | undefined;
  const eliminated = my?.eliminated ?? false;
  const isHolder = host.holderId === playerId;
  const holder = host.players.find((p) => p.playerId === host.holderId);
  const others = host.players.filter((p) => p.alive && p.playerId !== playerId);

  if (phase === 'intro') {
    return (
      <div style={wrap}>
        <span style={{ fontSize: '4.5rem', lineHeight: 1 }}>🥔</span>
        {host.category && (
          <>
            <Eyebrow>Kategorija</Eyebrow>
            <span className="display" style={{ fontWeight: 800, fontSize: '2rem', lineHeight: 1 }}>
              {host.category}
            </span>
          </>
        )}
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '20rem' }}>
          {host.mode === 'kviz'
            ? 'Pitanje sleće nasumičnom igraču — 5 sekundi za tačan odgovor ili 💥!'
            : 'Kaži reč iz kategorije i brzo prosledi krompir!'}
        </p>
      </div>
    );
  }

  if (phase === 'question' && host.question) {
    const q = host.question;
    if (eliminated || !isHolder) {
      return (
        <div style={wrap}>
          <span style={{ fontSize: '2.6rem' }}>{eliminated ? '💀' : '🥔'}</span>
          <p className="display" style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>
            {q.text}
          </p>
          <HolderLine holder={holder} suffix="odgovara…" />
        </div>
      );
    }
    // I hold the bomb — kit answer grid, 5 s on the header clock.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12, paddingTop: 14 }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <Eyebrow>🥔 Kod tebe je — odgovori!</Eyebrow>
          <p className="display" style={{ fontSize: '1.35rem', fontWeight: 700, margin: '6px 0 0', lineHeight: 1.15 }}>
            {q.text}
          </p>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AnswerButtons
            options={q.options as QuizOption[]}
            hasAnswered={false}
            selectedIndex={null}
            action="potato:answer"
          />
        </div>
      </div>
    );
  }

  if (phase === 'picking' && host.question) {
    if (!isHolder) {
      return (
        <div style={wrap}>
          <span style={{ fontSize: '2.4rem' }}>✅</span>
          <HolderLine holder={holder} suffix="je pogodio!" />
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Bira kome baca sledeće pitanje…
          </p>
        </div>
      );
    }
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 12,
          paddingTop: 16,
          background: verdictWash('correct'),
          overflowY: 'auto',
        }}
      >
        <RoundVerdict kind="correct" title="Tačno!" />
        {my?.nextQuestionText && (
          <div
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: 18,
              padding: '12px 14px',
            }}
          >
            <Eyebrow>👀 Sledeće pitanje · samo ti ga vidiš</Eyebrow>
            <p style={{ fontSize: '1rem', fontWeight: 700, margin: '6px 0 0' }}>{my.nextQuestionText}</p>
          </div>
        )}
        <PlayerGrid players={others} label="Kome ga bacaš?" />
      </div>
    );
  }

  if (phase === 'passing') {
    if (eliminated || !isHolder) {
      return (
        <div style={wrap}>
          {host.category && (
            <>
              <Eyebrow>Kategorija</Eyebrow>
              <span className="display" style={{ fontWeight: 800, fontSize: '1.6rem', lineHeight: 1 }}>
                {host.category}
              </span>
            </>
          )}
          <span style={{ fontSize: '4rem', lineHeight: 1, marginTop: 24 }}>🥔</span>
          <HolderLine holder={holder} prefix="Krompir je kod" big />
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            {eliminated
              ? 'Ispao si — gledaj ko će sledeći!'
              : 'Pripremi reč za slučaj da stigne do tebe!'}
          </p>
        </div>
      );
    }

    // I hold the bomb.
    return (
      <div style={{ ...wrap, justifyContent: 'flex-start', paddingTop: 20 }}>
        {host.category && (
          <>
            <Eyebrow>Kategorija</Eyebrow>
            <span className="display" style={{ fontWeight: 800, fontSize: '1.9rem', lineHeight: 1 }}>
              {host.category}
            </span>
          </>
        )}
        <span style={{ fontSize: '6.5rem', lineHeight: 1, marginTop: 24, animation: 'igra-wiggle 1.2s infinite' }}>
          🥔
        </span>
        <span className="display" style={{ fontWeight: 800, fontSize: '2.6rem', lineHeight: 1 }}>
          Kod tebe je!
        </span>
        <span style={{ fontSize: '1rem', fontWeight: 700, opacity: 0.9 }}>
          Kaži reč iz kategorije i prosledi
        </span>
        <div style={{ flex: 1 }} />
        {host.mode === 'sequential' ? (
          <button className="btn-primary" onClick={() => pass()} style={{ width: '100%', minHeight: 72, fontSize: '1.4rem' }}>
            Prosledi →
          </button>
        ) : (
          <PlayerGrid players={others} label="Kome prosleđuješ?" />
        )}
      </div>
    );
  }

  if (phase === 'exploded') {
    const iExploded = host.explodedId === playerId;
    const who = host.players.find((p) => p.playerId === host.explodedId);
    return (
      <div style={{ ...wrap, background: verdictWash(iExploded ? 'wrong' : 'neutral') }}>
        <RoundVerdict
          kind={iExploded ? 'wrong' : 'neutral'}
          icon="💥"
          title={iExploded ? 'Bum! Ispao si!' : `${who ? who.name : 'Neko'} je ispao!`}
        />
        {host.question && host.correctIndex != null && (
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Tačan odgovor:{' '}
            <strong style={{ color: 'var(--success-ink)' }}>
              {host.question.options[host.correctIndex]?.text}
            </strong>
          </p>
        )}
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
          {host.aliveCount === 1 ? 'Ostao je poslednji…' : `Još ${host.aliveCount} u igri`}
        </p>
      </div>
    );
  }

  if (phase === 'final-leaderboard' || phase === 'ended') {
    // With a TV the leaderboard already shows there; only hostless rooms need
    // the standings on the phone.
    if (hostless && host.leaderboard) {
      return (
        <HostlessLeaderboard title="Konačni poredak" entries={host.leaderboard} myPlayerId={playerId} />
      );
    }
    return (
      <div style={wrap}>
        <span style={{ fontSize: '3rem' }}>📺</span>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>Gledaj TV</p>
      </div>
    );
  }

  return null;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        opacity: 0.85,
      }}
    >
      {children}
    </span>
  );
}

function HolderLine({
  holder,
  prefix,
  suffix,
  big,
}: {
  holder?: HotPotatoPlayerLite;
  prefix?: string;
  suffix?: string;
  big?: boolean;
}) {
  return (
    <p
      className={big ? 'display' : undefined}
      style={{ fontSize: big ? '1.6rem' : '1rem', fontWeight: big ? 700 : 600, margin: 0 }}
    >
      {prefix && <>{prefix} </>}
      <strong>
        {holder?.avatarEmoji} {holder?.name ?? '—'}
      </strong>
      {suffix && <> {suffix}</>}
    </p>
  );
}

function PlayerGrid({ players, label }: { players: HotPotatoPlayerLite[]; label: string }) {
  return (
    <div style={{ width: '100%', flexShrink: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {players.map((p) => (
          <button
            key={p.playerId}
            onClick={() => pass(p.playerId)}
            style={{
              height: 64,
              minHeight: 64,
              borderRadius: 18,
              border: 'none',
              background: 'rgba(22,46,78,.55)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 12px',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: '30%',
                background: p.avatarColor,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1.25rem',
                flexShrink: 0,
              }}
            >
              {p.avatarEmoji}
            </span>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 800,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {p.name}
            </span>
          </button>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '0.82rem', fontWeight: 700, opacity: 0.85, textAlign: 'center' }}>
        {label}
      </p>
    </div>
  );
}
