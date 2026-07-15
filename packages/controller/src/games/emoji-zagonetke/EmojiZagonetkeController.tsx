import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import type {
  EmojiZagonetkeControllerData,
  EmojiZagonetkeHostData,
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

export default function EmojiZagonetkeController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, round, data, playerData } = gameState;
  const host = data.host as EmojiZagonetkeHostData;
  const my = playerData[playerId] as unknown as
    | EmojiZagonetkeControllerData
    | undefined;

  if (phase === 'showing-emojis') {
    return (
      <div style={wrap}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <p style={{ fontSize: '3.5rem', lineHeight: 1.2 }}>{host.emojis}</p>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Spremi se — uskoro kucaš odgovor!
        </p>
      </div>
    );
  }

  if (phase === 'answering') {
    if (my?.hasSolved) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2.5rem' }}>✅</p>
          <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Pogodio si!</p>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>
            +{my.ownPoints}
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.answeredCount}/{host.totalPlayers} pogodilo
          </p>
        </div>
      );
    }
    return (
      <AnswerView
        key={round}
        emojis={host.emojis ?? ''}
        hint={host.hint}
        answerLength={host.answerLength ?? 0}
        timeRemaining={timeRemaining}
        lastWrong={my?.lastWrong ?? null}
        hostless={hostless}
      />
    );
  }

  if (phase === 'showing-results') {
    const points = my?.ownPoints ?? 0;
    const solved = my?.hasSolved;
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2.5rem' }}>{host.emojis}</p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Odgovor</p>
        <p style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent)' }}>
          {host.answer}
        </p>
        <p style={{ fontSize: '1.1rem' }}>
          {solved ? (
            <span style={{ color: 'var(--success)', fontWeight: 800 }}>
              Tačno · +{points}
            </span>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>
              {my?.ownGuess ? `Netačno: ${my.ownGuess}` : 'Nisi pogodio'}
            </span>
          )}
        </p>
      </div>
    );
  }

  if (phase === 'leaderboard' || phase === 'ended') {
    if (hostless && host.leaderboard) {
      return (
        <HostlessLeaderboard
          title={phase === 'ended' ? 'Konačni poredak' : 'Poredak'}
          entries={host.leaderboard}
          myPlayerId={playerId}
        />
      );
    }
    const entry = host.leaderboard?.find((e) => e.playerId === playerId);
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          {phase === 'ended' ? 'Konačni plasman' : 'Poredak'}
        </p>
        {entry && (
          <>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
              #{entry.rank}
            </p>
            <p style={{ fontSize: '1.4rem', fontWeight: 600 }}>
              {entry.score.toLocaleString()} poena
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}

function AnswerView({
  emojis,
  hint,
  answerLength,
  timeRemaining,
  lastWrong,
  hostless,
}: {
  emojis: string;
  hint?: string;
  answerLength: number;
  timeRemaining: number;
  lastWrong: string | null;
  hostless: boolean;
}) {
  const [text, setText] = useState('');

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    socket.emit('game:player-action', { action: 'emoji:guess', data: { text: v } });
    setText('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1rem',
        gap: '0.85rem',
        justifyContent: 'center',
      }}
    >
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        Šta je ovo? · {timeRemaining}s
      </p>
      {/* On the phone-only (hostless) view the emojis aren't on any TV. */}
      {hostless && (
        <p style={{ fontSize: '3rem', textAlign: 'center', margin: 0, lineHeight: 1.2 }}>
          {emojis}
        </p>
      )}
      {hint ? (
        <p
          style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            letterSpacing: '0.1em',
            fontFamily: 'monospace',
            textAlign: 'center',
            color: 'var(--accent)',
            margin: 0,
          }}
        >
          {hint}
        </p>
      ) : (
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
          {answerLength} slova
        </p>
      )}

      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Ukucaj odgovor…"
        autoComplete="off"
        autoCorrect="off"
        style={{
          padding: '1rem',
          fontSize: '1.2rem',
          borderRadius: '12px',
          border: '2px solid var(--bg-card)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          textAlign: 'center',
        }}
      />

      {lastWrong && (
        <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center', margin: 0 }}>
          „{lastWrong}" nije tačno — probaj opet!
        </p>
      )}

      <button
        onClick={submit}
        disabled={!text.trim()}
        style={{
          padding: '1rem',
          fontSize: '1.2rem',
          fontWeight: 800,
          borderRadius: '12px',
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          opacity: text.trim() ? 1 : 0.5,
        }}
      >
        Pošalji
      </button>
    </div>
  );
}
