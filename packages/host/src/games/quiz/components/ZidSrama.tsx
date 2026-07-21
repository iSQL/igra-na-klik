import { motion } from 'framer-motion';

// Kviz "Zid srama" — a light-hearted per-round stat panel on the TV after the
// results: a "Puž" trophy for the slowest answer and a "niz srama" callout for
// anyone on a 3+ wrong streak. Mirrors the server's QuizRoundShame shape
// (packages/server/.../QuizState.ts); it rides in the untyped results `data`.

interface ShameEntry {
  playerId: string;
  name: string;
  avatarColor: string;
}
export interface RoundShame {
  snail: (ShameEntry & { timeMs: number }) | null;
  wrongStreak: (ShameEntry & { streak: number })[];
}

export function ZidSrama({ shame }: { shame: RoundShame }) {
  if (!shame.snail && shame.wrongStreak.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      style={{
        width: '100%',
        maxWidth: '620px',
        background: 'var(--bg-card)',
        border: '1px solid var(--line2)',
        borderRadius: '14px',
        padding: '0.9rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.05rem',
          color: 'var(--danger)',
          fontWeight: 700,
          letterSpacing: '0.02em',
        }}
      >
        😬 Zid srama
      </div>

      {shame.snail && (
        <Row
          avatarColor={shame.snail.avatarColor}
          emoji="🐌"
          text={
            <>
              <b>{shame.snail.name}</b> — Puž runde ({(shame.snail.timeMs / 1000).toFixed(1)}s)
            </>
          }
        />
      )}

      {shame.wrongStreak.map((w) => (
        <Row
          key={w.playerId}
          avatarColor={w.avatarColor}
          emoji="🔥"
          text={
            <>
              <b>{w.name}</b> — niz srama: {w.streak} netačnih zaredom
            </>
          }
        />
      ))}
    </motion.div>
  );
}

function Row({
  avatarColor,
  emoji,
  text,
}: {
  avatarColor: string;
  emoji: string;
  text: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>{emoji}</span>
      <span
        style={{
          width: '0.7rem',
          height: '0.7rem',
          borderRadius: '50%',
          background: avatarColor,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
        {text}
      </span>
    </div>
  );
}
