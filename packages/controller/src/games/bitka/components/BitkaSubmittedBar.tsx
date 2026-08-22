import type { BitkaHostData } from '@igra/shared';
import { BitkaMiniStandings } from './BitkaMiniStandings';

/**
 * Jedan te isti kadar posle slanja odgovora, za SVE tipove pitanja: potvrda,
 * pa ko je od ostalih već zaključao (avatari iz `expectedIds`/`answeredIds` —
 * samo id-jevi, nikad šta je ko izabrao), a u hostless sobi i mini tabla.
 *
 * Dotad je svaki tip imao svoju rečenicu („Poslato — čeka se protivnik",
 * „Pogodio si: X", „🔒 2/5 tačno"…), pa je isti trenutak na pet ekrana
 * izgledao kao pet različitih stanja.
 */
export function SubmittedBar({
  host,
  myPlayerId,
  hostless,
  note,
}: {
  host: BitkaHostData;
  myPlayerId: string;
  hostless: boolean;
  /** Umesto podrazumevanog „Poslato ✓" — npr. „Pogodio si: Nikola Tesla". */
  note?: string;
}) {
  const answered = new Set(host.answeredIds ?? []);
  const others = (host.expectedIds ?? []).filter((id) => id !== myPlayerId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        textAlign: 'center',
      }}
    >
      <span style={{ fontWeight: 800, color: 'var(--success)' }}>{note ?? 'Poslato ✓'}</span>
      {others.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
          {others.map((id) => {
            const p = host.players.find((x) => x.playerId === id);
            if (!p) return null;
            const done = answered.has(id);
            return (
              <span
                key={id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '999px',
                  background: 'var(--bg-card)',
                  border: done ? '1px solid var(--success)' : '1px dashed var(--line2)',
                  opacity: done ? 1 : 0.7,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    width: '1.3rem',
                    height: '1.3rem',
                    borderRadius: '50%',
                    background: p.avatarColor,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.7rem',
                  }}
                >
                  {p.avatarEmoji}
                </span>
                <span>{p.name}</span>
                <span style={{ color: done ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {done ? 'zaključao ✓' : 'razmišlja…'}
                </span>
              </span>
            );
          })}
        </div>
      )}
      {hostless && <BitkaMiniStandings host={host} myPlayerId={myPlayerId} />}
    </div>
  );
}
