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
          padding: '0.4rem 0.7rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          borderRadius: '0.5rem',
          background: 'rgba(0, 0, 0, 0.55)',
          color: 'var(--text-secondary)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(4px)',
        }}
      >
        {t('overlay.endGame')}
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
              background: 'var(--bg-card)',
              borderRadius: '0.9rem',
              padding: '1.4rem',
              maxWidth: '22rem',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('overlay.endGameConfirmTitle')}</h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.95rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}
            >
              {t('overlay.endGameConfirmBody')}
            </p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                onClick={() => setConfirming(false)}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  borderRadius: '0.6rem',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--bg-card)',
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
                  fontWeight: 700,
                  borderRadius: '0.6rem',
                  background: '#f39c12',
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
