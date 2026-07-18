import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { AnswerButtons } from '../quiz/components/AnswerButtons';
import type {
  HotPotatoControllerData,
  HotPotatoHostData,
  QuizOption,
} from '@igra/shared';

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '1rem',
  textAlign: 'center',
  padding: '1rem',
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

  if (!gameState || !playerId) return null;

  const { phase, data, playerData } = gameState;
  const host = data.host as HotPotatoHostData;
  const my = playerData[playerId] as unknown as
    | HotPotatoControllerData
    | undefined;
  const eliminated = my?.eliminated ?? false;
  const isHolder = host.holderId === playerId;
  const holder = host.players.find((p) => p.playerId === host.holderId);

  if (phase === 'intro') {
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2.6rem' }}>🥔💣</p>
        <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>Vruć krompir</p>
        {host.category && (
          <p style={{ fontSize: '1.1rem', color: 'var(--accent)', fontWeight: 700 }}>
            Kategorija: {host.category}
          </p>
        )}
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {host.mode === 'kviz'
            ? 'Pitanje sleće nasumičnom igraču — 5 sekundi za tačan odgovor ili 💥!'
            : 'Kaži reč iz kategorije i brzo prosledi krompir!'}
        </p>
      </div>
    );
  }

  if (phase === 'question' && host.question) {
    const q = host.question;
    const timeRemaining = gameState.timeRemaining;
    if (eliminated || !isHolder) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2rem' }}>{eliminated ? '💀' : '🥔'}</p>
          <p style={{ fontSize: '1rem', fontWeight: 700 }}>{q.text}</p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            <strong>
              {holder?.avatarEmoji} {holder?.name ?? '—'}
            </strong>{' '}
            odgovara… {timeRemaining}s
          </p>
        </div>
      );
    }
    // I hold the bomb — 5 seconds to answer!
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '0.75rem',
          gap: '0.6rem',
        }}
      >
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <p
            style={{
              fontSize: '1.3rem',
              fontWeight: 800,
              color: timeRemaining <= 2 ? 'var(--danger)' : 'var(--accent)',
              margin: 0,
            }}
          >
            🥔💣 {timeRemaining}s
          </p>
          <p style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.3rem 0 0' }}>
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
          <p style={{ fontSize: '2rem' }}>✅</p>
          <p style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            {holder?.avatarEmoji} {holder?.name ?? '—'} je pogodio!
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Bira kome baca sledeće pitanje…
          </p>
        </div>
      );
    }
    const others = host.players.filter((p) => p.alive && p.playerId !== playerId);
    return (
      <div style={{ ...wrap, justifyContent: 'flex-start', overflowY: 'auto' }}>
        <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--success)', margin: 0 }}>
          ✅ Tačno!
        </p>
        {my?.nextQuestionText && (
          <div
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              padding: '0.7rem 0.9rem',
              width: '100%',
            }}
          >
            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              👀 Sledeće pitanje (samo ti ga vidiš)
            </p>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.3rem 0 0' }}>
              {my.nextQuestionText}
            </p>
          </div>
        )}
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Kome ga bacaš? · {gameState.timeRemaining}s
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          {others.map((p) => (
            <button key={p.playerId} onClick={() => pass(p.playerId)} style={pickBtn}>
              {p.avatarEmoji} {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'passing') {
    if (eliminated) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2rem' }}>💀</p>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            Ispao si — gledaj ko će sledeći!
          </p>
          <p style={{ fontSize: '1rem' }}>
            Krompir je kod <strong>{holder?.name ?? '—'}</strong>
          </p>
        </div>
      );
    }

    if (!isHolder) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Kategorija: <strong style={{ color: 'var(--accent)' }}>{host.category}</strong>
          </p>
          <p style={{ fontSize: '3rem' }}>🥔</p>
          <p style={{ fontSize: '1.2rem' }}>
            Krompir je kod{' '}
            <strong>
              {holder?.avatarEmoji} {holder?.name ?? '—'}
            </strong>
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Pripremi reč iz kategorije za slučaj da stigne do tebe!
          </p>
        </div>
      );
    }

    // I hold the bomb.
    const others = host.players.filter((p) => p.alive && p.playerId !== playerId);
    return (
      <div style={wrap}>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Kategorija
        </p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)' }}>
          {host.category}
        </p>
        <p style={{ fontSize: '3.4rem' }}>🥔💣</p>
        <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          Krompir je kod tebe — kaži reč i prosledi!
        </p>

        {host.mode === 'sequential' ? (
          <button onClick={() => pass()} style={bigBtn}>
            Prosledi →
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Kome prosleđuješ?
            </span>
            {others.map((p) => (
              <button key={p.playerId} onClick={() => pass(p.playerId)} style={pickBtn}>
                {p.avatarEmoji} {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === 'exploded') {
    const iExploded = host.explodedId === playerId;
    const who = host.players.find((p) => p.playerId === host.explodedId);
    return (
      <div style={wrap}>
        <p style={{ fontSize: '3.5rem' }}>💥</p>
        {iExploded ? (
          <p style={{ fontSize: '1.5rem', fontWeight: 800 }}>Bum! Ispao si!</p>
        ) : (
          <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>
            {who ? `${who.avatarEmoji} ${who.name}` : 'Neko'} je ispao!
          </p>
        )}
        {host.question && host.correctIndex != null && (
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Tačan odgovor:{' '}
            <strong style={{ color: 'var(--success)' }}>
              {host.question.options[host.correctIndex]?.text}
            </strong>
          </p>
        )}
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
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
        <HostlessLeaderboard
          title="Konačni poredak"
          entries={host.leaderboard}
          myPlayerId={playerId}
        />
      );
    }
    return null;
  }

  return null;
}

const bigBtn: React.CSSProperties = {
  padding: '1.2rem',
  fontSize: '1.4rem',
  fontWeight: 800,
  borderRadius: 14,
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  width: '100%',
};

const pickBtn: React.CSSProperties = {
  padding: '0.9rem',
  fontSize: '1.1rem',
  fontWeight: 700,
  borderRadius: 12,
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  width: '100%',
};
