import { useEffect, useRef } from 'react';
import { useRoomStore } from '../store/roomStore';
import { useT } from '../i18n/useT';

// Read-only lobby chat display for the TV. Players type on their phones;
// the host just shows the running conversation while waiting in the lobby.
export function LobbyChatPanel() {
  const chatMessages = useRoomStore((s) => s.chatMessages);
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '600px',
        background: 'var(--bg-card)',
        borderRadius: '1rem',
        padding: '1rem',
        textAlign: 'left',
      }}
    >
      <h3
        style={{
          fontSize: '0.9rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-secondary)',
          marginBottom: '0.5rem',
        }}
      >
        💬 {t('chat.title')}
      </h3>
      <div
        ref={listRef}
        style={{
          maxHeight: '10rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
        }}
      >
        {chatMessages.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {t('chat.empty')}
          </p>
        )}
        {chatMessages.map((m) => (
          <p key={m.id} style={{ fontSize: '1rem', wordBreak: 'break-word' }}>
            <span style={{ color: m.avatarColor ?? 'var(--accent)', fontWeight: 700 }}>
              {m.avatarEmoji ? `${m.avatarEmoji} ` : ''}
              {m.playerName}:
            </span>{' '}
            {m.text}
          </p>
        ))}
      </div>
    </div>
  );
}
