import { useEffect, useState } from 'react';
import { GAME_DEFINITIONS, GAME_RULES } from '@igra/shared';
import { useT } from '../i18n/useT';
import { useRulesStore } from './RulesScreen';

const SEEN_KEY = 'igra-hint-seen';
/** The card never holds up play for long — it folds itself after this. */
const AUTO_HIDE_MS = 8000;

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function markSeen(gameId: string): void {
  try {
    const seen = readSeen();
    if (!seen.includes(gameId)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, gameId]));
  } catch {
    // Private mode etc. — the hint just shows again next time.
  }
}

/**
 * First time a device plays a game (redizajn 4c): one card with the game's
 * one-line `hint` from GAME_RULES over the game's intro. Shown once per game
 * per device; "Važi", the 8 s timer or "Sva pravila" all mark it seen.
 */
export function FirstTimeHint({ gameId }: { gameId: string }) {
  const t = useT();
  const showRules = useRulesStore((s) => s.show);
  const hint = GAME_RULES[gameId]?.hint;
  const [open, setOpen] = useState(() => !!hint && !readSeen().includes(gameId));

  useEffect(() => {
    if (!open) return;
    markSeen(gameId);
    const timer = setTimeout(() => setOpen(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [open, gameId]);

  if (!open || !hint) return null;
  const def = GAME_DEFINITIONS[gameId];

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 950,
        background: 'rgba(11,22,40,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'igra-fade .2s ease',
      }}
    >
      <div
        role="dialog"
        aria-label={hint.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          padding: 22,
          borderRadius: 24,
          background: 'var(--text-primary)',
          color: 'var(--bg-primary)',
          boxShadow: '0 24px 50px rgba(0,0,0,.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          animation: 'igra-pop .3s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.6rem' }}>{def?.icon}</span>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#B89040',
            }}
          >
            {t('hint.firstTime', { game: t(`game.${gameId}.name`) })}
          </span>
        </span>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.1 }}>
          {hint.title}
        </span>
        <span style={{ fontSize: '0.95rem', lineHeight: 1.45, opacity: 0.8 }}>{hint.text}</span>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={() => setOpen(false)}
            style={{
              flex: 1,
              height: 50,
              borderRadius: 14,
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: 'none',
              fontSize: '1rem',
              fontWeight: 800,
            }}
          >
            {t('hint.ok')}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              showRules(gameId);
            }}
            style={{
              height: 50,
              padding: '0 16px',
              borderRadius: 14,
              background: 'transparent',
              color: 'var(--bg-primary)',
              border: '1.5px solid rgba(29,53,87,.25)',
              fontSize: '0.95rem',
              fontWeight: 800,
            }}
          >
            {t('hint.allRules')}
          </button>
        </div>
      </div>
    </div>
  );
}
