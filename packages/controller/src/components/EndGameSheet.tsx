import { useState } from 'react';
import { socket } from '../socket';
import { useT } from '../i18n/useT';
import { useFlowStore } from '../store/flowStore';
import { BottomSheet } from './BottomSheet';
import { useGameName } from './PlayerMenu';

/**
 * "Završiti Kviz sada?" (Tok igre 1e) — replaces the old centred confirm.
 * Says how far the game got so the call isn't made blind, and lets the host
 * pick whether the others see the standings so far or go straight back to
 * the room. The safe button sits left and outlined; red is never first.
 */
export function EndGameSheet() {
  const t = useT();
  const panel = useFlowStore((s) => s.panel);
  const setPanel = useFlowStore((s) => s.setPanel);
  const flow = useFlowStore((s) => s.flow);
  const gameName = useGameName();
  const [showResults, setShowResults] = useState(true);

  if (panel !== 'end') return null;
  const close = () => setPanel(null);
  const progress =
    flow && flow.totalRounds > 0
      ? ' ' + t('endGame.progress', { round: flow.round, total: flow.totalRounds })
      : '';

  return (
    <BottomSheet label={t('endGame.title', { game: gameName })} onClose={close} zIndex={1200}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 8px' }}>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.1 }}>
          {t('endGame.title', { game: gameName })}
        </span>
        <span style={{ fontSize: '0.95rem', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
          {t('endGame.body')}
          {progress}
        </span>
        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <Choice
            on={showResults}
            title={t('endGame.showTable')}
            hint={t('endGame.showTableHint')}
            onClick={() => setShowResults(true)}
          />
          <Choice
            on={!showResults}
            title={t('endGame.noResults')}
            hint={t('endGame.noResultsHint')}
            onClick={() => setShowResults(false)}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
          <button
            onClick={close}
            style={{
              height: 54,
              borderRadius: 16,
              background: 'transparent',
              border: '1.5px solid var(--line2)',
              color: 'var(--text-primary)',
              fontWeight: 800,
              fontSize: '0.95rem',
            }}
          >
            {t('endGame.keepPlaying')}
          </button>
          <button
            onClick={() => {
              socket.emit('host:stop-game', { showResults });
              close();
            }}
            style={{
              height: 54,
              borderRadius: 16,
              background: 'var(--danger)',
              border: 'none',
              color: 'var(--bg-primary)',
              fontWeight: 800,
              fontSize: '0.95rem',
            }}
          >
            {t('overlay.end')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Choice({
  on,
  title,
  hint,
  onClick,
}: {
  on: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
        padding: '0 14px',
        borderRadius: 16,
        background: 'var(--bg-primary)',
        border: on ? '1.5px solid var(--accent)' : '1.5px solid transparent',
        color: 'var(--text-primary)',
        textAlign: 'left',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          border: on ? '6px solid var(--accent)' : '2px solid var(--line2)',
        }}
      />
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{title}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      </span>
    </button>
  );
}
