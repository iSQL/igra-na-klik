import { usePlayerStore } from '../store/playerStore';
import { useT } from '../i18n/useT';

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Shared "Napusti sobu?" confirmation modal. Rendered both by the on-screen
 * LeaveRoomButton and by the phone Back-button guard (BackButtonGuard), so the
 * copy/styling stays in one place.
 */
export function LeaveRoomDialog({ onCancel, onConfirm }: Props) {
  const { player, room } = usePlayerStore();
  const t = useT();

  const iAmRemoteHost =
    !!player && !!room && room.remoteHostPlayerId === player.id;

  return (
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
          {t('leave.confirmTitle')}
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
          {iAmRemoteHost
            ? room?.hostless
              ? t('leave.confirmBodyHostlessHost')
              : t('leave.confirmBodyRemoteHost')
            : t('leave.confirmBody')}
        </p>
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button
            onClick={onCancel}
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
            onClick={onConfirm}
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
            {t('leave.exit')}
          </button>
        </div>
      </div>
    </div>
  );
}
