import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH } from '@igra/shared';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { useT } from '../i18n/useT';

// Pre-game lobby chat: write + read on the phone. The server only accepts
// messages while the room is in the lobby, so this only renders there.
export function LobbyChat() {
  const chatMessages = usePlayerStore((s) => s.chatMessages);
  const myId = usePlayerStore((s) => s.player?.id);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('player:send-chat', { text: trimmed });
    setText('');
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '380px',
        background: 'var(--bg-card)',
        borderRadius: '0.9rem',
        padding: '0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        textAlign: 'left',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '0.8rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-secondary)',
        }}
      >
        💬 {t('chat.title')}
      </h3>

      <div
        ref={listRef}
        style={{
          maxHeight: '9rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.3rem',
        }}
      >
        {chatMessages.length === 0 && (
          <p
            style={{
              margin: 0,
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
            }}
          >
            {t('chat.empty')}
          </p>
        )}
        {chatMessages.map((m) => (
          <p
            key={m.id}
            style={{
              margin: 0,
              fontSize: '0.9rem',
              wordBreak: 'break-word',
            }}
          >
            <span
              style={{
                color: m.avatarColor ?? 'var(--accent)',
                fontWeight: m.playerId === myId ? 800 : 700,
              }}
            >
              {m.avatarEmoji ? `${m.avatarEmoji} ` : ''}
              {m.playerName}:
            </span>{' '}
            {m.text}
          </p>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <input
          type="text"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={t('chat.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '0.55rem 0.7rem',
            fontSize: '0.95rem',
            borderRadius: '0.55rem',
            border: '1px solid var(--bg-secondary)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          style={{
            padding: '0.55rem 0.9rem',
            fontSize: '0.9rem',
            fontWeight: 700,
            borderRadius: '0.55rem',
            border: 'none',
            background: text.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
            color: text.trim() ? '#fff' : 'var(--text-secondary)',
          }}
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
