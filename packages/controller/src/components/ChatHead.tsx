import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH } from '@igra/shared';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { useT } from '../i18n/useT';

// Floating pre-game chat "head": a collapsed 💬 bubble (bottom-right) with an
// unread badge that expands into a chat panel on tap and collapses back on
// tap/X. The server only accepts chat while the room is in the lobby, so this
// mounts on the lobby AND game-select screens (both are lobby room-state) and
// unmounts once a game starts.
export function ChatHead() {
  const chatMessages = usePlayerStore((s) => s.chatMessages);
  const myId = usePlayerStore((s) => s.player?.id);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  // How many messages the player had seen when the panel was last open —
  // the badge shows the difference while collapsed.
  const [seenCount, setSeenCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const t = useT();

  // Keep the list pinned to the newest message while open.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setSeenCount(chatMessages.length);
  }, [chatMessages, open]);

  // Badge counts only OTHER players' messages arrived since the panel was
  // last open — your own can't be "unread" (you can only send while open).
  const unread = chatMessages
    .slice(seenCount)
    .filter((m) => m.playerId !== myId).length;

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('player:send-chat', { text: trimmed });
    setText('');
  };

  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed',
            right: '0.9rem',
            bottom: 'calc(4.6rem + env(safe-area-inset-bottom, 0px))',
            width: 'min(92vw, 340px)',
            maxHeight: '55vh',
            background: 'var(--bg-card)',
            border: '1px solid var(--line2)',
            borderRadius: '16px',
            padding: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
            textAlign: 'left',
            zIndex: 800,
            boxShadow: '0 16px 40px rgba(0,0,0,.45)',
            animation: 'igra-pop .2s',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* No uppercase/letter-spacing here — the transform clipped the
                accent on "Ćaskanje" at this small size. */}
            <h3
              className="display"
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                lineHeight: 1.3,
                color: 'var(--text-primary)',
              }}
            >
              💬 {t('chat.title')}
            </h3>
            <button
              onClick={() => setOpen(false)}
              aria-label={t('common.cancel')}
              style={{
                width: '28px',
                height: '28px',
                minWidth: '28px',
                minHeight: '28px',
                padding: 0,
                borderRadius: '50%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--line)',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1,
              minHeight: '5rem',
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
      )}

      <button
        onClick={() => {
          // No auto-focus on open — the keyboard should only pop once the
          // player taps the input, so the message list stays readable first.
          setOpen((o) => {
            const next = !o;
            if (next) setSeenCount(usePlayerStore.getState().chatMessages.length);
            return next;
          });
        }}
        aria-label={t('chat.title')}
        aria-expanded={open}
        style={{
          position: 'fixed',
          right: '0.9rem',
          bottom: 'calc(0.9rem + env(safe-area-inset-bottom, 0px))',
          width: '52px',
          height: '52px',
          minWidth: '52px',
          minHeight: '52px',
          padding: 0,
          borderRadius: '50%',
          background: open ? 'var(--accent)' : 'var(--bg-card)',
          border: '1px solid var(--line2)',
          fontSize: '1.5rem',
          lineHeight: 1,
          zIndex: 810,
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        💬
        {!open && unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              minWidth: '20px',
              height: '20px',
              padding: '0 5px',
              borderRadius: '10px',
              background: 'var(--danger)',
              color: '#fff',
              fontSize: '0.7rem',
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              animation: 'igra-pop .25s',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  );
}
