import { create } from 'zustand';
import { GAME_DEFINITIONS, GAME_RULES, type GameDefinition } from '@igra/shared';
import { useGameStore } from '../store/gameStore';
import { useT } from '../i18n/useT';
import { ACCENT_HEX } from '../utils/gameAccent';

interface RulesStore {
  open: boolean;
  /** Detail view for this game; null = the list. */
  gameId: string | null;
  /** Opened straight onto a detail (hint card) — back closes instead of listing. */
  direct: boolean;
  show: (gameId?: string) => void;
  pick: (gameId: string | null) => void;
  close: () => void;
}

export const useRulesStore = create<RulesStore>((set) => ({
  open: false,
  gameId: null,
  direct: false,
  show: (gameId) => set({ open: true, gameId: gameId ?? null, direct: !!gameId }),
  pick: (gameId) => set({ gameId }),
  close: () => set({ open: false, gameId: null, direct: false }),
}));

/**
 * Rules in the app (redizajn 4a/4b) — same text as /uputstva, from the shared
 * GAME_RULES, so nobody leaves the room to read them. Opens from the start
 * screen's ⋯ menu and from the player menu during a game, where the current
 * game is pinned to the top. Rules text is Serbian by design.
 */
export function RulesScreen() {
  const { open, gameId, direct, pick, close } = useRulesStore();
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background:
          'radial-gradient(1200px 700px at 50% -12%, rgba(194,155,71,.16), transparent 60%), var(--bg-primary)',
        display: 'flex',
        justifyContent: 'center',
        animation: 'igra-fade .18s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          padding:
            'calc(16px + var(--safe-top, 0px)) 20px calc(20px + env(safe-area-inset-bottom, 0px))',
          minHeight: 0,
        }}
      >
        {gameId && GAME_RULES[gameId] ? (
          <RulesDetail
            gameId={gameId}
            onBack={direct ? close : () => pick(null)}
            onDone={close}
          />
        ) : (
          <RulesList onBack={close} onPick={pick} />
        )}
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      aria-label={t('common.back')}
      style={{
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        borderRadius: 14,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--line)',
        color: 'var(--text-primary)',
        fontSize: '1.4rem',
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      ‹
    </button>
  );
}

function GameTile({ def, size }: { def: GameDefinition; size: number }) {
  const hex = ACCENT_HEX[def.accent] ?? ACCENT_HEX.gold;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: hex + '2b',
        border: '1px solid ' + hex + '55',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.5,
        flexShrink: 0,
      }}
    >
      {def.icon}
    </span>
  );
}

const range = (def: GameDefinition) => `${def.minPlayers}–${def.maxPlayers}`;

function RulesList({ onBack, onPick }: { onBack: () => void; onPick: (id: string) => void }) {
  const t = useT();
  const currentId = useGameStore((s) => s.gameId);
  const games = Object.values(GAME_DEFINITIONS).filter((d) => GAME_RULES[d.id]);
  const current = currentId ? GAME_DEFINITIONS[currentId] : undefined;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <BackButton onClick={onBack} />
        <span className="display" style={{ fontWeight: 700, fontSize: '1.5rem' }}>
          {t('rules.title')}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 16 }}>
        {current && GAME_RULES[current.id] && (
          <button
            onClick={() => onPick(current.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              borderRadius: 18,
              background: 'var(--bg-secondary)',
              border: '1.5px solid var(--accent)',
              color: 'var(--text-primary)',
              textAlign: 'left',
              marginBottom: 18,
            }}
          >
            <GameTile def={current} size={44} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--amber)',
                }}
              >
                {t('rules.playingNow')}
              </span>
              <span className="display" style={{ fontWeight: 700, fontSize: '1.2rem', lineHeight: 1.1 }}>
                {t(`game.${current.id}.name`)}
              </span>
            </span>
            <span style={{ fontSize: '1.25rem', color: 'var(--amber)' }}>›</span>
          </button>
        )}
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          {t('rules.allGames')}
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
          {games.map((def) => (
            <button
              key={def.id}
              onClick={() => onPick(def.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 56,
                padding: 0,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--line)',
                borderRadius: 0,
                color: 'var(--text-primary)',
                textAlign: 'left',
              }}
            >
              <GameTile def={def} size={38} />
              <span style={{ flex: 1, fontSize: '1rem', fontWeight: 800 }}>
                {t(`game.${def.id}.name`)}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {range(def)}
              </span>
              <span style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function RulesDetail({
  gameId,
  onBack,
  onDone,
}: {
  gameId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const def = GAME_DEFINITIONS[gameId];
  const r = GAME_RULES[gameId];
  const structured = !!r.steps?.length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <BackButton onClick={onBack} />
        <span style={{ flex: 1 }} />
        {def && (
          <span
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 999,
              background: 'var(--bg-secondary)',
              fontSize: '0.82rem',
              fontWeight: 800,
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {range(def)} {t('common.player.many')}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 18, paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {def && <GameTile def={def} size={60} />}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="display" style={{ fontWeight: 700, fontSize: '1.85rem', lineHeight: 1 }}>
              {t(`game.${gameId}.name`)}
            </span>
            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t(`game.${gameId}.blurb`)}
            </span>
          </span>
        </div>
        {r.requiresTv && (
          <div
            style={{
              marginTop: 14,
              display: 'inline-block',
              padding: '6px 12px',
              borderRadius: 10,
              background: 'var(--bg-secondary)',
              fontSize: '0.85rem',
              fontWeight: 800,
            }}
          >
            {t('rules.tvOnly')}
          </div>
        )}

        {structured ? (
          <>
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {r.steps!.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: 'var(--bg-primary)',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: '0.95rem', lineHeight: 1.4, paddingTop: 3 }}>{step}</span>
                </div>
              ))}
            </div>
            {r.points && r.points.length > 0 && (
              <>
                <div
                  style={{
                    marginTop: 20,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('rules.points')}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                  }}
                >
                  {r.points.map((p) => (
                    <div
                      key={p.label}
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        background: 'var(--bg-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <span
                        className="display"
                        style={{ fontWeight: 800, fontSize: '1.75rem', lineHeight: 1, color: 'var(--amber)' }}
                      >
                        {p.value}
                      </span>
                      <span style={{ fontSize: '0.82rem', lineHeight: 1.3, color: 'var(--text-secondary)' }}>
                        {p.label}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {r.notes && r.notes.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: '0.9rem',
                  lineHeight: 1.4,
                  color: 'var(--text-secondary)',
                }}
              >
                {r.notes.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          // Trusted, author-written HTML from GAME_RULES (same as /uputstva).
          <div className="rules-body" dangerouslySetInnerHTML={{ __html: r.body }} />
        )}
        {r.moreHref && (
          <a
            href={r.moreHref}
            target="_blank"
            rel="noopener"
            style={{
              display: 'inline-block',
              marginTop: 12,
              fontWeight: 800,
              color: 'var(--amber)',
              textDecoration: 'none',
            }}
          >
            {r.moreLabel ?? '→'}
          </a>
        )}
      </div>
      <button className="btn-primary" onClick={onDone} style={{ flexShrink: 0 }}>
        {t('rules.gotIt')}
      </button>
    </>
  );
}
