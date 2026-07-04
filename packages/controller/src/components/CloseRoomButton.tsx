import { useState } from 'react';
import { socket } from '../socket';
import { useT } from '../i18n/useT';

// "Close room" for the remote-host holder: deletes the room and kicks
// everyone (the TV then auto-creates a fresh room). Only render this for
// the player currently holding the remote-host claim — the server rejects
// the event from anyone else.
export function CloseRoomButton() {
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        style={{
          padding: '0.4rem 0.9rem',
          fontSize: '0.85rem',
          borderRadius: '0.5rem',
          background: 'transparent',
          color: '#e74c3c',
          border: '1px solid #e74c3c',
        }}
      >
        {t('closeRoom.button')}
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
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
              {t('closeRoom.confirmTitle')}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.95rem',
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
                onClick={() => {
                  socket.emit('host:close-room');
                  setConfirming(false);
                }}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  fontSize: '0.95rem',
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
