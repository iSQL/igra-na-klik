import type { GameDefinition, PublicPlayer } from '@igra/shared';
import { useT } from '../i18n/useT';

/** How many connected players haven't played `gameId` yet. */
export function notPlayedCount(players: PublicPlayer[], gameId: string): number {
  return players.filter((p) => p.isConnected && !p.playedGames?.includes(gameId)).length;
}

/** "Preporuka": most of the room hasn't played this game yet. */
export function probaRecommended(players: PublicPlayer[], gameId: string): boolean {
  const connected = players.filter((p) => p.isConnected).length;
  return connected > 0 && notPlayedCount(players, gameId) * 2 > connected;
}

/**
 * Proba ili prava igra (Tok igre 3a) — only for games with a tutorial mode.
 * "PREPORUKA" lights up when most of the room hasn't played the game, which
 * is also when Proba is preselected.
 */
export function ProbaPicker({
  game,
  players,
  proba,
  onChange,
}: {
  game: GameDefinition;
  players: PublicPlayer[];
  proba: boolean;
  onChange: (proba: boolean) => void;
}) {
  const t = useT();
  if (!game.tutorial) return null;
  const connected = players.filter((p) => p.isConnected).length;
  const notPlayed = notPlayedCount(players, game.id);
  const recommended = probaRecommended(players, game.id);
  const line =
    notPlayed === 0
      ? null
      : notPlayed === connected
        ? t('tutorial.nobodyPlayed', { n: connected })
        : t('tutorial.someNotPlayed', { k: notPlayed, n: connected });

  return (
    <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {line && (
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {line}
        </span>
      )}
      <Card
        on={proba}
        icon="🎓"
        title={t('tutorial.proba')}
        badge={recommended ? t('tutorial.recommended') : undefined}
        text={`${game.tutorial.blurb} ${t('tutorial.minutes', { n: game.tutorial.minutes })}`}
        onClick={() => onChange(true)}
      />
      <Card
        on={!proba}
        icon="▶"
        title={t('tutorial.realGame')}
        text={t('tutorial.realGameHint')}
        onClick={() => onChange(false)}
      />
    </div>
  );
}

function Card({
  on,
  icon,
  title,
  badge,
  text,
  onClick,
}: {
  on: boolean;
  icon: string;
  title: string;
  badge?: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      style={{
        display: 'flex',
        gap: 14,
        padding: 16,
        borderRadius: 20,
        background: 'var(--bg-primary)',
        border: on ? '1.5px solid var(--accent)' : '1.5px solid transparent',
        color: 'var(--text-primary)',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>{icon}</span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{title}</span>
          {badge && (
            <span
              style={{
                height: 22,
                padding: '0 8px',
                borderRadius: 999,
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                fontSize: '0.68rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <span style={{ fontSize: '0.85rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
          {text}
        </span>
      </span>
    </button>
  );
}
