import { useState } from 'react';
import { socket } from '../socket';
import { useRoomStore } from '../store/roomStore';
import { useT } from '../i18n/useT';

// "Close room" for the TV host. Confirmed close kicks every player and
// deletes the room; marking selfClosed makes the room:destroyed handler
// redirect this TV to the landing page instead of auto-creating a room.
export function CloseRoomButton() {
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  const handleConfirm = () => {
    useRoomStore.getState().setSelfClosed(true);
    socket.emit('host:close-room');
    setConfirming(false);
  };

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '0.9rem',
          borderRadius: '0.5rem',
          background: 'transparent',
          border: '1px solid var(--text-secondary)',
          color: 'var(--text-secondary)',
        }}
      >
        {t('closeRoom.button')}
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirming(false)}
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
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              borderRadius: '0.9rem',
              padding: '1.6rem',
              maxWidth: '26rem',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>
              {t('closeRoom.confirmTitle')}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '1rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}
            >
              {t('closeRoom.confirmBody')}
            </p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                onClick={() => setConfirming(false)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  fontSize: '1rem',
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
                  padding: '0.75rem',
                  fontSize: '1rem',
                  fontWeight: 700,
                  borderRadius: '0.6rem',
                  background: '#e74c3c',
                  color: '#fff',
                  border: 'none',
                }}
              >
                {t('closeRoom.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
