import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import type {
  AsocijacijeColumnView,
  AsocijacijeHostData,
  AsocijacijeScoreEntry,
} from '@igra/shared';

export default function AsocijacijeHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevResultRef = useRef<string | null>(null);

  const host = gameState?.data.host as AsocijacijeHostData | undefined;

  useEffect(() => {
    if (!gameState) return;
    const { phase } = gameState;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'board-results') play('reveal');
      if (phase === 'ended' || phase === 'leaderboard') play('victory');
      prevPhaseRef.current = phase;
    }
  }, [gameState, play]);

  useEffect(() => {
    if (!host?.lastResult) return;
    const key = `${host.lastResult.text}|${host.lastResult.actorName}`;
    if (key !== prevResultRef.current) {
      play(host.lastResult.correct ? 'correct' : 'wrong');
      prevResultRef.current = key;
    }
  }, [host?.lastResult, play]);

  if (!gameState || !host) return null;
  const { phase, timeRemaining } = gameState;

  if (phase === 'leaderboard' || phase === 'ended') {
    return <FinalLeaderboard host={host} />;
  }

  const showResults = phase === 'board-results';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1.2rem 1.4rem 1rem',
        gap: '0.8rem',
        boxSizing: 'border-box',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.9rem',
              fontWeight: 800,
              color: 'var(--gold, #C29B47)',
            }}
          >
            Asocijacije
          </span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
            Tabla {host.board}/{host.totalBoards} ·{' '}
            {host.mode === 'kviz' ? 'kviz mod' : 'klasik'}
          </span>
        </div>
        {!showResults && (
          <ActivePlayerChip host={host} timeRemaining={timeRemaining} />
        )}
      </div>

      {/* Result banner */}
      <ResultBanner host={host} showResults={showResults} />

      {/* Board */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.9rem',
        }}
      >
        {host.columns.map((col) => (
          <ColumnView key={col.letter} col={col} />
        ))}
      </div>

      {/* Final solution */}
      <FinalBar host={host} />

      {/* Scores */}
      <ScoreStrip scores={host.scores} activeId={host.activePlayerId} />

      {/* Kviz question overlay */}
      <AnimatePresence>
        {host.question && <QuestionOverlay host={host} timeRemaining={timeRemaining} />}
      </AnimatePresence>
    </div>
  );
}

function ActivePlayerChip({
  host,
  timeRemaining,
}: {
  host: AsocijacijeHostData;
  timeRemaining: number;
}) {
  if (!host.activePlayerName) return null;
  const low = timeRemaining <= 10;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.9rem',
          borderRadius: '999px',
          background: 'var(--bg-card)',
          borderLeft: `6px solid ${host.activePlayerColor ?? 'var(--gold, #C29B47)'}`,
          fontWeight: 700,
        }}
      >
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Na potezu
        </span>
        <span style={{ fontSize: '1.15rem' }}>{host.activePlayerName}</span>
      </div>
      <div
        style={{
          minWidth: '3.2rem',
          textAlign: 'center',
          padding: '0.4rem 0.7rem',
          borderRadius: '12px',
          fontWeight: 800,
          fontSize: '1.5rem',
          color: low ? 'var(--danger, #E5533C)' : 'var(--text-primary)',
          background: 'var(--bg-secondary)',
        }}
      >
        {timeRemaining}
      </div>
    </div>
  );
}

function ResultBanner({
  host,
  showResults,
}: {
  host: AsocijacijeHostData;
  showResults: boolean;
}) {
  if (showResults) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '0.5rem',
          borderRadius: '12px',
          background: 'rgba(194,155,71,.14)',
          border: '1px solid var(--gold, #C29B47)',
          fontWeight: 800,
          fontSize: '1.25rem',
        }}
      >
        {host.boardWinnerName
          ? `🏆 ${host.boardWinnerName} pogodio konačno rešenje: ${host.finalSolution}`
          : `Kraj table · konačno rešenje: ${host.finalSolution}`}
      </div>
    );
  }
  const r = host.lastResult;
  if (!r) {
    return (
      <div
        style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontWeight: 600,
          minHeight: '1.9rem',
        }}
      >
        Otvori polje, pogodi kolonu ili konačno rešenje
      </div>
    );
  }
  return (
    <motion.div
      key={`${r.text}|${r.actorName}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        textAlign: 'center',
        padding: '0.45rem 0.8rem',
        borderRadius: '12px',
        fontWeight: 800,
        fontSize: '1.15rem',
        color: r.correct ? '#1c7a4a' : '#8a2b1f',
        background: r.correct ? 'rgba(47,224,138,.16)' : 'rgba(229,83,60,.14)',
        border: `1px solid ${r.correct ? 'var(--success, #2FE08A)' : 'var(--danger, #E5533C)'}`,
      }}
    >
      {r.actorName ? `${r.actorName}: ` : ''}
      {r.text}
    </motion.div>
  );
}

function ColumnView({ col }: { col: AsocijacijeColumnView }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 0 }}>
      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
        {col.fields.map((f) => (
          <div
            key={f.num}
            style={{
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '12px',
              padding: '0.4rem',
              textAlign: 'center',
              background: f.open ? 'var(--bg-card)' : col.color,
              color: f.open ? 'var(--text-primary)' : '#1D2A44',
              fontWeight: 800,
              fontSize: f.open ? '1.35rem' : '1.5rem',
              border: f.open ? `2px solid ${col.color}` : '2px solid transparent',
              transition: 'background .3s',
            }}
          >
            {f.open ? f.word : f.num}
          </div>
        ))}
      </div>

      {/* Solution bar (bottom) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.1rem',
          padding: '0.45rem 0.6rem',
          borderRadius: '12px',
          background: col.solved ? col.color : 'var(--bg-card)',
          color: col.solved ? '#1D2A44' : 'var(--text-primary)',
          fontWeight: 800,
          minHeight: '2.8rem',
          justifyContent: 'center',
          border: col.solved ? '2px solid transparent' : `2px solid ${col.color}`,
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            opacity: 0.85,
          }}
        >
          Kolona {col.letter}
        </span>
        <span style={{ fontSize: '1.2rem', letterSpacing: '.02em' }}>
          {col.solved ? col.solution : '?'}
        </span>
      </div>
    </div>
  );
}

function FinalBar({ host }: { host: AsocijacijeHostData }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.8rem',
        padding: '0.7rem',
        borderRadius: '14px',
        background: host.finalSolved
          ? 'var(--gold, #C29B47)'
          : 'var(--bg-card)',
        color: host.finalSolved ? '#1D2A44' : 'var(--text-primary)',
        border: '2px solid var(--gold, #C29B47)',
        fontWeight: 800,
      }}
    >
      <span style={{ color: host.finalSolved ? '#1D2A44' : 'var(--text-secondary)', fontSize: '0.95rem' }}>
        KONAČNO REŠENJE
      </span>
      <span style={{ fontSize: '1.7rem', letterSpacing: '.04em' }}>
        {host.finalSolved ? host.finalSolution : '?'}
      </span>
    </div>
  );
}

function ScoreStrip({
  scores,
  activeId,
}: {
  scores: AsocijacijeScoreEntry[];
  activeId: string | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      {scores.map((s) => (
        <div
          key={s.playerId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.7rem',
            borderRadius: '999px',
            background: s.playerId === activeId ? 'var(--gold, #C29B47)' : 'var(--bg-secondary)',
            color: s.playerId === activeId ? '#1D2A44' : 'var(--text-primary)',
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: '1.4rem',
              height: '1.4rem',
              borderRadius: '50%',
              background: s.avatarColor,
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.8rem',
            }}
          >
            {s.avatarEmoji}
          </span>
          <span>{s.name}</span>
          <span style={{ fontWeight: 800 }}>{s.score}</span>
        </div>
      ))}
    </div>
  );
}

function QuestionOverlay({
  host,
  timeRemaining,
}: {
  host: AsocijacijeHostData;
  timeRemaining: number;
}) {
  const q = host.question!;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(22,46,78,.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.4rem',
        padding: '2rem',
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ color: 'var(--gold, #C29B47)', fontWeight: 800, fontSize: '1.3rem' }}>
          {q.fieldNum}
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {host.activePlayerName} odgovara · {timeRemaining}s
        </span>
      </div>
      <p
        style={{
          fontSize: '2.4rem',
          fontWeight: 800,
          textAlign: 'center',
          maxWidth: '1000px',
          margin: 0,
        }}
      >
        {q.text}
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: q.options.length > 2 ? '1fr 1fr' : '1fr',
          gap: '0.9rem',
          width: '100%',
          maxWidth: '820px',
        }}
      >
        {q.options.map((opt, i) => (
          <div
            key={i}
            style={{
              padding: '1rem 1.2rem',
              borderRadius: '14px',
              background: 'var(--bg-card)',
              fontWeight: 800,
              fontSize: '1.5rem',
              textAlign: 'center',
            }}
          >
            {opt}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function FinalLeaderboard({ host }: { host: AsocijacijeHostData }) {
  const entries = host.leaderboard ?? host.scores;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1.1rem',
        padding: '2rem',
      }}
    >
      <p style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--gold, #C29B47)' }}>
        Konačni poredak
      </p>
      <div style={{ width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {entries.map((e) => (
          <div
            key={e.playerId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: e.rank === 1 ? 'var(--gold, #C29B47)' : 'var(--bg-secondary)',
              color: e.rank === 1 ? '#1D2A44' : 'var(--text-primary)',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.2rem', minWidth: '2ch' }}>
                #{e.rank}
              </span>
              <span
                style={{
                  width: '1.75rem',
                  height: '1.75rem',
                  borderRadius: '50%',
                  background: e.avatarColor,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {e.avatarEmoji}
              </span>
              <span style={{ fontWeight: 700 }}>{e.name}</span>
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
              {e.score.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
