import { motion } from 'framer-motion';
import type { AwardTone, PlayerAward } from '@igra/shared';
import { useGameStore } from '../store/gameStore';
import { useRoomStore } from '../store/roomStore';

// Full-screen TV overlay that hands every player a funny "utešna diploma" at
// game end. Driven by the awards stored from the game:ended event; renders
// nothing when there are none (team games, or before a game ends).

const TONE_ACCENT: Record<AwardTone, string> = {
  positive: 'var(--success)',
  shame: 'var(--danger)',
  neutral: 'var(--accent)',
};

export function Diplome() {
  const awards = useGameStore((s) => s.awards);
  const players = useRoomStore((s) => s.players);

  if (!awards || awards.length === 0) return null;

  const nameOf = (playerId: string) =>
    players.find((p) => p.id === playerId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background:
          'radial-gradient(1200px 700px at 50% -10%, rgba(194,155,71,0.18), transparent 60%), var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem',
        overflow: 'hidden',
      }}
    >
      <motion.h1
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 4.5vw, 3.4rem)',
          color: 'var(--accent)',
          margin: 0,
          textAlign: 'center',
        }}
      >
        🎓 Podela diploma
      </motion.h1>
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: 'clamp(0.95rem, 1.6vw, 1.2rem)',
          margin: '0.5rem 0 2rem',
          textAlign: 'center',
        }}
      >
        Niko ne odlazi praznih ruku!
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
          gap: '1.1rem',
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '68vh',
          overflowY: 'auto',
        }}
      >
        {awards.map((award, i) => (
          <DiplomaCard
            key={award.playerId}
            award={award}
            player={nameOf(award.playerId)}
            index={i}
          />
        ))}
      </div>
    </motion.div>
  );
}

function DiplomaCard({
  award,
  player,
  index,
}: {
  award: PlayerAward;
  player: { name: string; avatarColor: string; avatarEmoji: string } | undefined;
  index: number;
}) {
  const accent = TONE_ACCENT[award.tone];
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, y: 16 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.12, type: 'spring', stiffness: 220, damping: 20 }}
      style={{
        background: 'var(--bg-card)',
        border: `2px solid ${accent}`,
        borderRadius: '16px',
        padding: '1.25rem 1.35rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
        boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
        <span
          style={{
            width: '2.4rem',
            height: '2.4rem',
            borderRadius: '50%',
            background: player?.avatarColor ?? '#666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.3rem',
            flexShrink: 0,
          }}
        >
          {player?.avatarEmoji ?? '🎮'}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.15rem',
            color: 'var(--text-primary)',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {player?.name ?? '???'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
        <span style={{ fontSize: '2.1rem', lineHeight: 1 }}>{award.emoji}</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              color: accent,
              fontWeight: 700,
              lineHeight: 1.15,
            }}
          >
            {award.title}
          </span>
          {award.subtitle && (
            <span
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
                marginTop: '0.2rem',
              }}
            >
              {award.subtitle}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
