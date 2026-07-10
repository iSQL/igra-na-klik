import { useState } from 'react';
import { AVATAR_COLORS, AVATAR_EMOJIS, MAX_PLAYER_NAME_LENGTH } from '@igra/shared';
import { socket } from '../socket';
import { useT } from '../i18n/useT';

/**
 * Name + colour + emoji profile editor. Emits `player:set-name` /
 * `player:set-avatar` (both accepted any time, not just in the lobby), so it
 * works from the lobby and from the in-game player menu alike.
 */
export function AvatarPickerModal({
  currentName,
  currentColor,
  currentEmoji,
  onClose,
}: {
  currentName: string;
  currentColor: string;
  currentEmoji: string;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(currentName);
  const trimmed = name.trim();
  const canSaveName = trimmed.length > 0 && trimmed !== currentName;

  const saveName = () => {
    if (!canSaveName) return;
    socket.emit('player:set-name', { name: trimmed });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: '1rem',
          padding: '1.25rem',
          width: '100%',
          maxWidth: '380px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{t('avatar.editProfile')}</h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: 'none',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '0 0.25rem',
            }}
          >
            ×
          </button>
        </div>

        <div>
          <p
            style={{
              margin: 0,
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}
          >
            {t('avatar.name')}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_PLAYER_NAME_LENGTH))}
              maxLength={MAX_PLAYER_NAME_LENGTH}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '0.6rem 0.8rem',
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: '10px',
                border: '1.5px solid var(--line2)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={saveName}
              disabled={!canSaveName}
              style={{
                padding: '0.6rem 1rem',
                fontSize: '0.9rem',
                fontWeight: 800,
                borderRadius: '10px',
                border: 'none',
                background: canSaveName ? 'var(--accent)' : 'var(--bg-card)',
                color: canSaveName ? '#fff' : 'var(--dim)',
              }}
            >
              {t('avatar.saveName')}
            </button>
          </div>
        </div>

        <div>
          <p
            style={{
              margin: 0,
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}
          >
            {t('avatar.color')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.5rem',
            }}
          >
            {AVATAR_COLORS.map((color) => {
              const active = color === currentColor;
              return (
                <button
                  key={color}
                  onClick={() =>
                    socket.emit('player:set-avatar', { avatarColor: color })
                  }
                  aria-label={t('common.colorAria', { color })}
                  style={{
                    aspectRatio: '1',
                    background: color,
                    borderRadius: '0.5rem',
                    border: active ? '3px solid #fff' : '3px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              );
            })}
          </div>
        </div>

        <div>
          <p
            style={{
              margin: 0,
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}
          >
            {t('avatar.symbol')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '0.4rem',
            }}
          >
            {AVATAR_EMOJIS.map((emoji) => {
              const active = emoji === currentEmoji;
              return (
                <button
                  key={emoji}
                  onClick={() =>
                    socket.emit('player:set-avatar', { avatarEmoji: emoji })
                  }
                  style={{
                    aspectRatio: '1',
                    background: active ? 'var(--accent)' : 'var(--bg-card)',
                    borderRadius: '0.4rem',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
