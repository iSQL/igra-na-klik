import { motion } from 'framer-motion';
import type { FibbageRevealOption } from '@igra/shared';
import { fibbageGlasLabel } from '@igra/shared';
import { useRoomStore } from '../../../store/roomStore';

interface FoolsBoardProps {
  /** All reveal options, in the module's order. Only lies with votes render. */
  options: FibbageRevealOption[];
  /** Seconds to wait before the board comes up (after the truth lands). */
  delay: number;
}

/**
 * "Ko je koga nasamario" — the payoff line of the round, spelled out.
 *
 * The option rows above already carry the author and the voters' avatars, but
 * across a living room that reads as decoration: you can see *that* two people
 * fell for something without ever registering *who*. This says it in words.
 */
export function FoolsBoard({ options, delay }: FoolsBoardProps) {
  const players = useRoomStore((s) => s.players);
  const playerById = (id: string) => players.find((p) => p.id === id);

  const fools = options.filter((o) => !o.isReal && o.voterPlayerIds.length > 0);

  // A clean round is worth saying out loud — silence here reads as a missing
  // section, not as "everybody saw through every lie".
  if (fools.length === 0) {
    const anyLies = options.some((o) => !o.isReal);
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay, duration: 0.45 }}
        style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          fontSize: '1.05rem',
          fontWeight: 700,
          color: 'var(--text-secondary)',
        }}
      >
        {anyLies
          ? '🎯 Niko nikoga nije nasamario — sve laži su prozrete.'
          : '🎯 Niko nije ni napisao laž ove runde.'}
      </motion.p>
    );
  }

  // Biggest catch first — this block is a scoreboard of the round's best lies.
  const ranked = [...fools].sort(
    (a, b) => b.voterPlayerIds.length - a.voterPlayerIds.length
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45 }}
      style={{
        marginTop: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <p
        style={{
          fontSize: '0.8rem',
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          textAlign: 'center',
          margin: 0,
        }}
      >
        🤥 Ko je koga nasamario
      </p>

      {ranked.map((opt, i) => (
        <motion.div
          key={opt.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: delay + 0.25 + i * 0.3, duration: 0.35 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            padding: '0.7rem 1.1rem',
            background: 'var(--bg-secondary)',
            borderRadius: '0.75rem',
            borderLeft: '4px solid var(--accent)',
            fontSize: '1.05rem',
          }}
        >
          {/* Liar */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {opt.authorPlayerIds.map((id) => {
              const p = playerById(id);
              return (
                <span
                  key={id}
                  style={{
                    width: '1.7rem',
                    height: '1.7rem',
                    borderRadius: '50%',
                    backgroundColor: p?.avatarColor ?? '#666',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.95rem',
                  }}
                >
                  {p?.avatarEmoji}
                </span>
              );
            })}
            <strong style={{ fontWeight: 800 }}>{opt.authorNames.join(' i ')}</strong>
          </span>

          <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>
            nasamario/la:
          </span>

          {/* Fooled */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {opt.voterPlayerIds.map((id, vi) => {
              const p = playerById(id);
              return (
                <span
                  key={id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontWeight: 800,
                    color: 'var(--accent)',
                  }}
                >
                  <span
                    style={{
                      width: '1.5rem',
                      height: '1.5rem',
                      borderRadius: '50%',
                      backgroundColor: p?.avatarColor ?? '#666',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem',
                    }}
                  >
                    {p?.avatarEmoji}
                  </span>
                  {opt.voterNames[vi] ?? p?.name ?? '?'}
                </span>
              );
            })}
          </span>

          <span
            style={{
              fontWeight: 800,
              color: 'var(--success)',
              whiteSpace: 'nowrap',
            }}
          >
            +{opt.pointsEarned}
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginLeft: '0.35rem',
              }}
            >
              ({opt.voterPlayerIds.length} {fibbageGlasLabel(opt.voterPlayerIds.length)})
            </span>
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
}
