import { useEffect, useRef, useState } from 'react';
import { GAME_DEFINITIONS } from '@igra/shared';
import { useT } from '../../i18n/useT';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';

// The last standings a game broadcast (its round-end leaderboard). Filled by
// a module-level subscription, like quizFeedbackStore — the card itself only
// exists for the 1.2 s it's on screen, long after the leaderboard went by.
let lastStandings: { gameId: string; entries: { playerId: string; score: number }[] } | null =
  null;

function extractStandings(data: Record<string, unknown> | undefined) {
  if (!data) return null;
  const host = data.host as Record<string, unknown> | undefined;
  const raw = (data.leaderboard ?? host?.leaderboard) as unknown;
  if (!Array.isArray(raw)) return null;
  const entries = raw
    .filter(
      (e): e is { playerId: string; score: number } =>
        !!e &&
        typeof (e as { playerId?: unknown }).playerId === 'string' &&
        typeof (e as { score?: unknown }).score === 'number'
    )
    .map((e) => ({ playerId: e.playerId, score: e.score }));
  return entries.length > 0 ? entries : null;
}

useGameStore.subscribe((s) => {
  const gs = s.gameState;
  if (!gs) return;
  const entries = extractStandings(gs.data);
  if (entries) lastStandings = { gameId: gs.gameId, entries };
});

/** "Ti si 2. · 380 iza Ane" from the last leaderboard this game showed. */
function usePersonalLine(gameId: string): string | null {
  const t = useT();
  const me = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  if (!me || !lastStandings || lastStandings.gameId !== gameId) return null;
  const lower = !!GAME_DEFINITIONS[gameId]?.lowerScoreWins;
  const sorted = [...lastStandings.entries].sort((a, b) =>
    lower ? a.score - b.score : b.score - a.score
  );
  const mine = sorted.find((e) => e.playerId === me.id);
  if (!mine) return null;
  const rank = sorted.findIndex((e) => e.score === mine.score) + 1;
  if (rank === 1) return t('round.youLead');
  const ahead = sorted[rank - 2];
  const name = room?.players.find((p) => p.id === ahead.playerId)?.name ?? '?';
  return t('round.youAre', { rank, gap: Math.abs(ahead.score - mine.score), name });
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Gold interstitial "Runda 3 od 5" (Tok igre 2b) — the only gold screen in a
 * game, 1.2 s, never blocks a tap. Shows when `round` goes up (not for the
 * first round, which the game's own intro covers). The new-round cue already
 * fires from GameFrame's roundKey, so this one stays silent.
 */
export function RoundCard({
  gameId,
  round,
  total,
  note,
}: {
  gameId: string;
  round: number;
  total: number;
  note?: string;
}) {
  const t = useT();
  const prev = useRef(round);
  const [shown, setShown] = useState<number | null>(null);
  const line = usePersonalLine(gameId);

  useEffect(() => {
    const was = prev.current;
    prev.current = round;
    if (round <= was || round <= 1) return;
    setShown(round);
    const id = setTimeout(() => setShown(null), 1200);
    return () => clearTimeout(id);
  }, [round]);

  if (shown === null) return null;
  const reduced = reducedMotion();

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 940,
        pointerEvents: 'none',
        background:
          'radial-gradient(600px 500px at 50% 40%, rgba(250,246,240,.35), transparent 70%), var(--accent)',
        color: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        textAlign: 'center',
        padding: 24,
        animation: `igra-round-card 1.2s ${reduced ? 'linear' : 'ease'} forwards`,
      }}
    >
      <span
        style={{
          fontSize: '0.82rem',
          fontWeight: 800,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {t('round.label')}
      </span>
      <span
        className="display"
        style={{
          fontWeight: 800,
          fontSize: '10rem',
          lineHeight: 0.85,
          animation: reduced ? undefined : 'igra-round-num .32s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        {shown}
      </span>
      <span className="display" style={{ fontWeight: 700, fontSize: '1.4rem' }}>
        {t('round.of', { total })}
        {note ? ` · ${note}` : ''}
      </span>
      {line && (
        <span
          style={{
            marginTop: 28,
            padding: '10px 16px',
            borderRadius: 999,
            background: 'rgba(22,46,78,.12)',
            fontSize: '0.95rem',
            fontWeight: 800,
          }}
        >
          {line}
        </span>
      )}
    </div>
  );
}
