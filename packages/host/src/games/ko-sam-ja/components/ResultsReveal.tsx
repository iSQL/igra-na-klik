import { motion } from 'framer-motion';
import type { KoSamJaResultData } from '@igra/shared';
import { useRoomStore } from '../../../store/roomStore';

interface ResultsRevealProps {
  results: KoSamJaResultData;
}

export function ResultsReveal({ results }: ResultsRevealProps) {
  const players = useRoomStore((s) => s.players);
  const playerById = (id: string) => players.find((p) => p.id === id);

  if (results.skipped) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          textAlign: 'center',
          padding: '2rem',
          background: 'var(--bg-card)',
          borderRadius: '1rem',
        }}
      >
        <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
          {results.subjectName} je propustio/la — prelazimo dalje.
        </p>
      </div>
    );
  }

  const correctOption = results.options.find(
    (o) => o.id === results.correctOptionId
  );
  const subject = playerById(results.subjectPlayerId);

  return (
    <div style={{ width: '100%', maxWidth: '760px' }}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ textAlign: 'center', marginBottom: '1.25rem' }}
      >
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          Tačan odgovor za{' '}
          <strong style={{ color: 'var(--accent)' }}>
            {results.subjectName}
          </strong>
          :
        </p>
        <p
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: 'var(--success)',
            margin: '0.25rem 0 0',
          }}
        >
          {correctOption?.text ?? '?'}
        </p>
      </motion.div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          marginBottom: '1rem',
        }}
      >
        {results.guesses.map((g, i) => {
          const p = playerById(g.playerId);
          return (
            <motion.div
              key={g.playerId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-card)',
                borderRadius: '0.6rem',
                borderLeft: `4px solid ${p?.avatarColor ?? '#666'}`,
              }}
            >
              <span style={{ flex: 1, fontSize: '1.1rem', fontWeight: 600 }}>
                {p?.avatarEmoji} {g.playerName}
              </span>
              <span
                style={{
                  fontSize: '0.95rem',
                  color: g.correct
                    ? 'var(--success)'
                    : 'var(--text-secondary)',
                }}
              >
                {g.correct
                  ? '✓ Tačno'
                  : g.optionId
                    ? `pogrešno: ${
                        results.options.find((o) => o.id === g.optionId)
                          ?.text ?? '?'
                      }`
                    : 'Nije pogodio'}
              </span>
              <span
                style={{
                  minWidth: '4ch',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: 'var(--accent)',
                  fontFamily: 'monospace',
                }}
              >
                +{g.roundScore}
              </span>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem 1.1rem',
          background: 'var(--bg-secondary)',
          borderRadius: '0.6rem',
          borderLeft: `4px solid ${subject?.avatarColor ?? 'var(--accent)'}`,
        }}
      >
        <span style={{ flex: 1, fontSize: '1.05rem', fontWeight: 600 }}>
          {subject?.avatarEmoji} {results.subjectName}{' '}
          <span
            style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}
          >
            (predmet pitanja, {results.wrongGuessCount} pogrešnih)
          </span>
        </span>
        <span
          style={{
            minWidth: '4ch',
            textAlign: 'right',
            fontWeight: 700,
            color: 'var(--accent)',
            fontFamily: 'monospace',
          }}
        >
          +{results.subjectBonus}
        </span>
      </motion.div>
    </div>
  );
}
