import { TUTORIAL_FLOW, tutorialStep } from '@igra/shared';
import { socket } from '../../socket';
import { usePlayerStore } from '../../store/playerStore';
import { useFlowStore } from '../../store/flowStore';

/**
 * Proba (Tok igre 3b–3d) — the shared pieces the three tutorial games
 * (Gluvo doba, Zavet, Špijun) render instead of their old banners and
 * "Sledeća faza ▸" buttons. Texts come from the games' own tutorial hints
 * and from TUTORIAL_FLOW; nothing here depends on anyone's role.
 */

/** "🎓 PROBA" + step dots — sits where the clock would be. */
export function TutorialBadge({ gameId, phase }: { gameId: string; phase: string }) {
  const s = tutorialStep(gameId, phase);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <span
        style={{
          height: 28,
          padding: '0 10px',
          borderRadius: 999,
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          fontSize: '0.72rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        🎓 PROBA
      </span>
      {s && (
        <span aria-label={`${s.step}/${s.total}`} style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: s.total }, (_, i) => (
            <span
              key={i}
              style={{
                width: 12,
                height: 6,
                borderRadius: 3,
                background: i < s.step ? 'var(--amber)' : 'rgba(245,235,224,.2)',
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * Personal tip as a cream card with a notch pointing up at the part of the
 * screen it talks about; the game above stays fully usable.
 */
export function TutorialCoach({
  gameId,
  phase,
  text,
}: {
  gameId: string;
  phase: string;
  text: string;
}) {
  const s = tutorialStep(gameId, phase);
  return (
    <div
      key={phase + text}
      style={{
        position: 'relative',
        flexShrink: 0,
        marginTop: 8,
        padding: '12px 14px',
        borderRadius: 18,
        background: '#faf6f0',
        color: '#1D3557',
        boxShadow: '0 14px 32px rgba(0,0,0,.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        animation: 'igra-slide-up .26s cubic-bezier(.22,1,.36,1)',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: -7,
          left: 36,
          width: 14,
          height: 14,
          background: '#faf6f0',
          transform: 'rotate(45deg)',
        }}
      />
      <span
        style={{
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: '#B89040',
        }}
      >
        Savet{s ? ` · ${s.step} od ${s.total}` : ''}
      </span>
      <span style={{ fontSize: '0.88rem', lineHeight: 1.45, fontWeight: 600 }}>{text}</span>
    </div>
  );
}

/**
 * The holder runs the proba (3c): how many are done, one sentence to read
 * out loud, and the button named after the phase it leads to.
 */
export function TutorialHostCard({
  gameId,
  phase,
  action,
  label,
  tip,
}: {
  gameId: string;
  phase: string;
  /** The game's own `*:next-phase` host action. */
  action: string;
  /** Overrides "Sledeća faza: {ime} ▸" (Zavet's "Preskoči potez ▸"). */
  label?: string;
  /** The holder's own personal tip — they're playing too. */
  tip?: string | null;
}) {
  const flow = useFlowStore((s) => s.flow);
  const tf = TUTORIAL_FLOW[gameId];
  const next = tf?.nextLabel[phase];
  const aloud = tf?.readAloud[phase];
  const c = flow?.collection;
  return (
    <div
      style={{
        flexShrink: 0,
        padding: 14,
        borderRadius: 20,
        background: 'var(--bg-secondary)',
        border: '1.5px solid var(--accent)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--amber)',
        }}
      >
        👑 Ti vodiš probu
      </span>
      {c && c.expectedIds.length > 0 && (
        <span style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
          Odigralo je{' '}
          <b>
            {c.doneCount} od {c.expectedIds.length}
          </b>
          .{' '}
          {c.doneCount < c.expectedIds.length
            ? 'Kad svi završe ili kad objasniš šta se desilo, idi dalje.'
            : 'Svi su završili — idi dalje.'}
        </span>
      )}
      {aloud && (
        <span
          style={{
            alignSelf: 'flex-start',
            padding: '6px 10px',
            borderRadius: 12,
            background: 'rgba(245,235,224,.08)',
            fontSize: '0.8rem',
            fontWeight: 700,
            lineHeight: 1.35,
          }}
        >
          🗣 Pročitaj naglas: „{aloud}”
        </span>
      )}
      {tip && (
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          🎓 {tip}
        </span>
      )}
      <button
        onClick={() => socket.emit('host:game-action', { action })}
        style={{
          height: 52,
          borderRadius: 16,
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          border: 'none',
          fontWeight: 800,
          fontSize: '1rem',
        }}
      >
        {label ?? (next ? `Sledeća faza: ${next} ▸` : 'Sledeća faza ▸')}
      </button>
    </div>
  );
}

/**
 * "Spremni ste!" (3d) — the end of a proba. The holder starts the real game
 * (or another proba) with the same settings; everyone else waits for them.
 */
export function TutorialDone({ gameId }: { gameId: string }) {
  const me = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const holder = room?.players.find((p) => p.id === room.remoteHostPlayerId);
  const iAmHolder = !!me && holder?.id === me.id;
  const recap = TUTORIAL_FLOW[gameId]?.recap ?? [];
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        paddingTop: 12,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: '3.4rem', lineHeight: 1 }}>🎓</span>
        <span className="display" style={{ fontWeight: 800, fontSize: '2.2rem', lineHeight: 1 }}>
          Spremni ste!
        </span>
        <span
          style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', maxWidth: 290 }}
        >
          Prava partija dobija tajmere, poene i podelu ispočetka.
        </span>
        <div
          style={{
            marginTop: 14,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            textAlign: 'left',
          }}
        >
          {recap.map((line) => (
            <div
              key={line}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 14,
                background: 'rgba(245,235,224,.05)',
                fontSize: '0.88rem',
                fontWeight: 700,
              }}
            >
              <span style={{ color: 'var(--lime)', fontWeight: 800 }}>✓</span>
              {line}
            </div>
          ))}
        </div>
      </div>
      {iAmHolder ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => socket.emit('host:restart-game', { tutorial: false })}
            style={{
              height: 56,
              borderRadius: 16,
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              border: 'none',
              fontWeight: 800,
              fontSize: '1.05rem',
            }}
          >
            ▶ Igraj pravu partiju
          </button>
          <button
            onClick={() => socket.emit('host:restart-game', { tutorial: true })}
            style={{
              height: 52,
              borderRadius: 16,
              background: 'transparent',
              border: '1.5px solid var(--line2)',
              color: 'var(--text-primary)',
              fontWeight: 800,
              fontSize: '0.95rem',
            }}
          >
            Još jedna proba
          </button>
        </div>
      ) : (
        <span
          style={{
            flexShrink: 0,
            textAlign: 'center',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            paddingBottom: 8,
          }}
        >
          Čekamo da {holder?.name ?? 'domaćin'} pokrene partiju…
        </span>
      )}
    </div>
  );
}
