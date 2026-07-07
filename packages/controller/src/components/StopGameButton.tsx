import { useState } from 'react';
import { socket } from '../socket';
import { useT } from '../i18n/useT';

export function StopGameButton() {
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  const handleConfirm = () => {
    socket.emit('host:stop-game');
    setConfirming(false);
  };

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        style={{
          padding: '0.4rem 0.8rem',
          fontSize: '0.8rem',
          fontWeight: 800,
          borderRadius: '12px',
          background: 'rgba(255, 77, 94, 0.14)',
          color: 'var(--danger)',
          border: '1px solid rgba(255, 77, 94, 0.5)',
          backdropFilter: 'blur(4px)',
          minHeight: '40px',
        }}
      >
        ✕ {t('overlay.endGame')}
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 15, 35, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              borderRadius: '18px',
              padding: '1.4rem',
              maxWidth: '22rem',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              textAlign: 'center',
              animation: 'igra-pop .25s',
            }}
          >
            <h2 className="display" style={{ margin: 0, fontSize: '1.25rem' }}>
              {t('overlay.endGameConfirmTitle')}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                lineHeight: 1.45,
              }}
            >
              {t('overlay.endGameConfirmBody')}
            </p>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                onClick={() => setConfirming(false)}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  borderRadius: '12px',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: '1.5px solid var(--line2)',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  borderRadius: '12px',
                  background: 'var(--danger)',
                  color: '#fff',
                  border: 'none',
                }}
              >
                {t('overlay.end')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
