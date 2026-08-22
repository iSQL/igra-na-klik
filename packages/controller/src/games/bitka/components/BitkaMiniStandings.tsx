import type { BitkaHostData } from '@igra/shared';

/**
 * Uska tabla poena — u hostless sobi ne postoji drugo mesto gde se vidi ko
 * vodi. Pun prikaz i dalje živi u profilnom popupu.
 *
 * U svom fajlu, a ne u hostless traci: koriste je i ekrani pitanja (kroz
 * `SubmittedBar`), koje traka sama uvozi — bez ovoga bi uvoz išao ukrug.
 */
export function BitkaMiniStandings({
  host,
  myPlayerId,
}: {
  host: BitkaHostData;
  myPlayerId: string;
}) {
  const sorted = [...host.players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center' }}>
      {sorted.map((p) => (
        <span
          key={p.playerId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.28rem',
            padding: '0.15rem 0.45rem',
            borderRadius: '999px',
            fontSize: '0.72rem',
            fontWeight: 700,
            background: 'rgba(0,0,0,0.45)',
            borderLeft: `3px solid ${p.avatarColor}`,
            textShadow: 'none',
            opacity: p.eliminated ? 0.45 : 1,
          }}
        >
          <span>{p.avatarEmoji}</span>
          <span>{p.playerId === myPlayerId ? 'ti' : p.name}</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {p.eliminated ? 'ispao' : `${p.territories}t`}
          </span>
          <strong style={{ color: 'var(--accent)' }}>{p.score}</strong>
        </span>
      ))}
    </div>
  );
}
