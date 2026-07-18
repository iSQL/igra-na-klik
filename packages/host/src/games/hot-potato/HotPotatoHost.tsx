import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { OptionGrid } from '../quiz/components/OptionGrid';
import type { HotPotatoHostData, QuizOption } from '@igra/shared';

export default function HotPotatoHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);

  const phase = gameState?.phase;

  useEffect(() => {
    if (!phase) return;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'exploded') play('wrong');
      if (phase === 'ended' || phase === 'final-leaderboard') play('victory');
      prevPhaseRef.current = phase;
    }
  }, [phase, play]);

  // Ticking heartbeat while the bomb is live — no numbers, just tension.
  useEffect(() => {
    if (phase !== 'passing' && phase !== 'question') return;
    const id = setInterval(() => play('tick'), 1000);
    return () => clearInterval(id);
  }, [phase, play]);

  if (!gameState) return null;
  const timeRemaining = gameState.timeRemaining;

  const host = gameState.data.host as HotPotatoHostData;
  const holder = host.players.find((p) => p.playerId === host.holderId);
  const exploded = host.players.find((p) => p.playerId === host.explodedId);
  const alive = host.players.filter((p) => p.alive);

  if (phase === 'intro') {
    return (
      <Center>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '3.6rem', fontWeight: 800 }}
        >
          🥔 Vruć krompir
        </motion.p>
        <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)', maxWidth: 640, textAlign: 'center' }}>
          {host.mode === 'kviz'
            ? 'Pitanje sleće nasumičnom igraču — 5 sekundi za odgovor! Tačno = biraš kome ide sledeće, netačno = 💥 ispadaš!'
            : 'Kaži reč iz kategorije i brzo prosledi krompir — kod koga pukne, ispada!'}
        </p>
        {host.category && (
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
            Kategorija: {host.category}
          </p>
        )}
      </Center>
    );
  }

  if ((phase === 'question' || phase === 'picking') && host.question) {
    const q = host.question;
    return (
      <Center>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Pitanje {host.round} · {host.aliveCount} u igri
          {phase === 'question' && (
            <>
              {' · '}
              <strong
                style={{
                  color: timeRemaining <= 2 ? 'var(--danger)' : 'var(--accent)',
                  fontSize: '1.4rem',
                }}
              >
                {timeRemaining}s
              </strong>
            </>
          )}
        </p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>
          🥔💣 {holder ? `${holder.avatarEmoji} ${holder.name}` : '—'}{' '}
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {phase === 'question' ? 'odgovara!' : 'bira kome baca sledeće pitanje…'}
          </span>
        </p>
        <p
          className="display"
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            textAlign: 'center',
            maxWidth: '1000px',
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {q.text}
        </p>
        {q.imageUrl && (
          <img
            src={q.imageUrl}
            alt=""
            style={{ maxWidth: 'min(70%, 520px)', maxHeight: '30vh', objectFit: 'contain', borderRadius: '0.8rem' }}
          />
        )}
        <OptionGrid
          options={q.options as QuizOption[]}
          showResults={phase === 'picking'}
          correctIndex={phase === 'picking' ? host.correctIndex : undefined}
        />
        {phase === 'picking' && (
          <motion.p
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--success)' }}
          >
            ✅ Tačno! Novo pitanje čeka…
          </motion.p>
        )}
        <PlayerRing players={alive} highlightId={host.holderId} />
      </Center>
    );
  }

  if (phase === 'passing') {
    return (
      <Center>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round} · {host.aliveCount} u igri
        </p>
        <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
          Kategorija
        </p>
        <p style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--accent)' }}>
          {host.category}
        </p>

        <motion.div
          animate={{ rotate: [-8, 8, -8], scale: [1, 1.06, 1] }}
          transition={{ duration: 0.35, repeat: Infinity, ease: 'easeInOut' }}
          style={{ fontSize: '6rem', lineHeight: 1 }}
        >
          🥔💣
        </motion.div>

        <p style={{ fontSize: '2rem', fontWeight: 800 }}>
          {holder ? `${holder.avatarEmoji} ${holder.name}` : '—'}
        </p>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          drži krompir — prosledi ga na telefonu!
        </p>

        <PlayerRing players={alive} highlightId={host.holderId} />
      </Center>
    );
  }

  if (phase === 'exploded') {
    return (
      <Center>
        <motion.div
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: [0.3, 1.3, 1], opacity: 1 }}
          transition={{ duration: 0.5 }}
          style={{ fontSize: '7rem', lineHeight: 1 }}
        >
          💥
        </motion.div>
        <p style={{ fontSize: '2.4rem', fontWeight: 800 }}>
          {exploded ? `${exploded.avatarEmoji} ${exploded.name}` : 'Neko'} ispada!
        </p>
        {host.question && (
          <>
            <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', maxWidth: 800, textAlign: 'center', margin: 0 }}>
              {host.question.text}
            </p>
            <OptionGrid
              options={host.question.options as QuizOption[]}
              showResults
              correctIndex={host.correctIndex}
            />
          </>
        )}
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          {host.aliveCount === 1
            ? 'Ostao je poslednji preživeli…'
            : `Još ${host.aliveCount} u igri`}
        </p>
      </Center>
    );
  }

  if ((phase === 'final-leaderboard' || phase === 'ended') && host.leaderboard) {
    const winner = host.players.find((p) => p.playerId === host.winnerId);
    return (
      <Center>
        <p style={{ fontSize: '4rem', lineHeight: 1 }}>🏆</p>
        <p style={{ fontSize: '2rem', fontWeight: 800 }}>
          {winner ? `${winner.avatarEmoji} ${winner.name}` : 'Pobednik'} pobeđuje!
        </p>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          {host.leaderboard.map((entry) => (
            <div
              key={entry.playerId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: 8,
                padding: '0.7rem 1rem',
                borderLeft: `5px solid ${entry.avatarColor}`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <strong style={{ color: 'var(--accent)', minWidth: '2ch' }}>#{entry.rank}</strong>
                <span style={{ fontWeight: 600 }}>{entry.name}</span>
              </span>
              <span style={{ fontWeight: 700 }}>{entry.score}</span>
            </div>
          ))}
        </div>
      </Center>
    );
  }

  return null;
}

function PlayerRing({
  players,
  highlightId,
}: {
  players: HotPotatoHostData['players'];
  highlightId?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.6rem',
        justifyContent: 'center',
        maxWidth: 720,
        marginTop: '0.5rem',
      }}
    >
      {players.map((p) => {
        const active = p.playerId === highlightId;
        return (
          <div
            key={p.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.75rem',
              borderRadius: 999,
              background: active ? 'var(--accent)' : 'var(--bg-secondary)',
              color: active ? '#fff' : 'var(--text-primary)',
              fontWeight: active ? 800 : 600,
              border: `2px solid ${p.avatarColor}`,
            }}
          >
            <span>{p.avatarEmoji}</span>
            <span>{p.name}</span>
          </div>
        );
      })}
    </div>
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
        height: '100%',
        gap: '1rem',
        padding: '1.5rem',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}
