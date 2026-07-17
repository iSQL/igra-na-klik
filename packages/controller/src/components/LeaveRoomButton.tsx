import { useState } from 'react';
import { socket } from '../socket';
import { useT } from '../i18n/useT';
import { LeaveRoomDialog } from './LeaveRoomDialog';

interface Props {
  variant?: 'inline' | 'overlay';
}

export function LeaveRoomButton({ variant = 'inline' }: Props) {
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  const handleConfirm = () => {
    socket.emit('player:leave-room');
    setConfirming(false);
  };

  const triggerStyle: React.CSSProperties =
    variant === 'overlay'
      ? {
          padding: '0.4rem 0.7rem',
          fontSize: '0.8rem',
          fontWeight: 800,
          borderRadius: '12px',
          background: 'rgba(11, 10, 23, 0.55)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--line2)',
          backdropFilter: 'blur(4px)',
          minHeight: '40px',
        }
      : {
          padding: '0.6rem 1.5rem',
          fontSize: '0.9rem',
          fontWeight: 800,
          borderRadius: '14px',
          background: 'transparent',
          color: 'var(--text-primary)',
          border: '1.5px solid var(--line2)',
        };

  return (
    <>
      <button onClick={() => setConfirming(true)} style={triggerStyle}>
        {t('leave.leaveRoom')}
      </button>

      {confirming && (
        <LeaveRoomDialog
          onCancel={() => setConfirming(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
