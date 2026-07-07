import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import type {
  DveIstineControllerData,
  DveIstineHostData,
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

export default function DveIstineController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as DveIstineHostData;
  const my = playerData[playerId] as unknown as
    | DveIstineControllerData
    | undefined;

  if (phase === 'collecting') {
    if (my?.hasSubmitted) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>Poslato ✓</p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Čekamo ostale: {host.submittedCount}/{host.totalSubmitters}
          </p>
        </div>
      );
    }
    return <CollectForm timeRemaining={timeRemaining} />;
  }

  if (phase === 'guessing') {
    const statements = host.statements ?? [];
    if (my?.role === 'subject') {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>
            Ostali pogađaju tvoju laž 🤫
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.guessedCount}/{host.totalGuessers} pogodilo · {timeRemaining}s
          </p>
        </div>
      );
    }
    if (my?.role !== 'guesser') {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.2rem' }}>Gledaj rundu...</p>
        </div>
      );
    }
    if (my.hasGuessed) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            Izabrao si laž:
          </p>
          <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>
            „{statements[my.guessedIndex ?? 0]?.text}"
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.guessedCount}/{host.totalGuessers} pogodilo
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
          width: '100%',
          padding: '1rem',
          gap: '0.75rem',
        }}
      >
        <p style={{ fontSize: '1.15rem', fontWeight: 800, textAlign: 'center' }}>
          Šta je laž o igraču {host.subjectName}?
        </p>
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {timeRemaining}s
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {statements.map((s) => (
            <button
              key={s.index}
              onClick={() => socket.emit('game:player-action', {
                action: 'dveistine:guess',
                data: { index: s.index },
              })}
              style={{
                padding: '1rem',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '1rem',
                textAlign: 'left',
                lineHeight: 1.3,
              }}
            >
              {s.text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'showing-results') {
    const statements = host.statements ?? [];
    const lieText =
      host.lieIndex !== undefined ? statements[host.lieIndex]?.text : '';
    const roundScore = my?.ownRoundScore ?? 0;
    const isSubject = my?.role === 'subject';
    return (
      <div style={wrap}>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Laž je bila
        </p>
        <p style={{ fontSize: '1.3rem', fontWeight: 800 }}>„{lieText}"</p>
        {!isSubject && (
          <p
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: my?.wasCorrect ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {my?.wasCorrect ? 'Pogodio si! 🎯' : 'Prevaren si 🙈'}
          </p>
        )}
        <p
          style={{
            fontSize: '1.3rem',
            fontWeight: 800,
            color: roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
          }}
        >
          {isSubject && roundScore > 0 ? '🕵️ ' : ''}
          {roundScore > 0 ? `+${roundScore}` : '+0'} poena
        </p>
        {isSubject && roundScore > 0 && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Prevario si nekog!
          </p>
        )}
      </div>
    );
  }

  if (phase === 'ended') {
    const entry = host.leaderboard?.find((e) => e.playerId === playerId);
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Konačni plasman
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

function CollectForm({ timeRemaining }: { timeRemaining: number }) {
  const [truth1, setTruth1] = useState('');
  const [truth2, setTruth2] = useState('');
  const [lie, setLie] = useState('');
  const [sent, setSent] = useState(false);

  const ready = truth1.trim() && truth2.trim() && lie.trim();

  const submit = () => {
    if (!ready || sent) return;
    setSent(true);
    socket.emit('game:player-action', {
      action: 'dveistine:submit',
      data: {
        truth1: truth1.trim(),
        truth2: truth2.trim(),
        lie: lie.trim(),
      },
    });
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.7rem 0.85rem',
    fontSize: '1rem',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '2px solid var(--bg-card)',
    borderRadius: '10px',
    width: '100%',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: 700,
    margin: '0 0 0.25rem',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem',
        width: '100%',
        overflowY: 'auto',
      }}
    >
      <p style={{ fontSize: '1.15rem', fontWeight: 800, textAlign: 'center', margin: 0 }}>
        Dve istine i jedna laž o tebi
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        Napiši dve stvari koje su istinite i jednu izmišljenu · {timeRemaining}s
      </p>

      <div>
        <p style={{ ...labelStyle, color: 'var(--success)' }}>✓ Istina 1</p>
        <input style={inputStyle} maxLength={120} value={truth1} onChange={(e) => setTruth1(e.target.value)} placeholder="npr. Bio sam u 12 zemalja" />
      </div>
      <div>
        <p style={{ ...labelStyle, color: 'var(--success)' }}>✓ Istina 2</p>
        <input style={inputStyle} maxLength={120} value={truth2} onChange={(e) => setTruth2(e.target.value)} placeholder="npr. Sviram klavir" />
      </div>
      <div>
        <p style={{ ...labelStyle, color: 'var(--danger)' }}>✗ Laž</p>
        <input style={inputStyle} maxLength={120} value={lie} onChange={(e) => setLie(e.target.value)} placeholder="npr. Preskočio sam iz aviona" />
      </div>

      <button
        onClick={submit}
        disabled={!ready || sent}
        style={{
          marginTop: '0.25rem',
          padding: '0.9rem',
          fontSize: '1.1rem',
          fontWeight: 800,
          borderRadius: '12px',
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          opacity: !ready || sent ? 0.5 : 1,
        }}
      >
        {sent ? 'Poslato ✓' : 'Pošalji'}
      </button>
    </div>
  );
}
