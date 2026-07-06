import { useState } from 'react';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '@igra/shared';
import { usePlayerStore } from '../store/playerStore';
import { useNavStore } from '../store/navStore';
import { useGameStore } from '../store/gameStore';
import { socket } from '../socket';
import { LeaveRoomButton } from '../components/LeaveRoomButton';
import { CloseRoomButton } from '../components/CloseRoomButton';
import { CopyRoomLinkButton } from '../components/CopyRoomLinkButton';
import { LobbyChat } from '../components/LobbyChat';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n/useT';

export function LobbyScreen() {
  const { player, room } = usePlayerStore();
  const setScreen = useNavStore((s) => s.setScreen);
  const lastStartPayload = useGameStore((s) => s.lastStartPayload);
  const [pickerOpen, setPickerOpen] = useState(false);
  const t = useT();

  if (!player || !room) return null;

  const remoteHostId = room.remoteHostPlayerId;
  const iAmRemoteHost = remoteHostId === player.id;
  const holder = remoteHostId
    ? room.players.find((p) => p.id === remoteHostId)
    : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        textAlign: 'center',
      }}
    >
      <LanguageSwitch />

      <button
        onClick={() => setPickerOpen(true)}
        aria-label={t('lobby.changeAvatar')}
        style={{
          width: '5rem',
          height: '5rem',
          borderRadius: '50%',
          backgroundColor: player.avatarColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.4rem',
          border: '3px solid rgba(255,255,255,0.2)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {player.avatarEmoji}
      </button>

      <h1 style={{ fontSize: '1.5rem' }}>{player.name}</h1>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', margin: 0 }}>
          {t('lobby.room')} <strong style={{ color: 'var(--accent)' }}>{room.code}</strong>
        </p>
        {room.hostless && <CopyRoomLinkButton code={room.code} />}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          alignItems: 'center',
        }}
      >
        {iAmRemoteHost ? (
          <>
            <button
              onClick={() => setScreen('game-select')}
              style={{
                padding: '0.85rem 1.6rem',
                fontSize: '1.05rem',
                fontWeight: 700,
                borderRadius: '0.75rem',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
              }}
            >
              {t('lobby.chooseGameArrow')}
            </button>
            {lastStartPayload && (
              <button
                onClick={() =>
                  socket.emit('host:start-game', lastStartPayload)
                }
                style={{
                  padding: '0.6rem 1.2rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  borderRadius: '0.6rem',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: '2px solid var(--accent)',
                }}
              >
                {t('lobby.playAgain', {
                  name: t(`game.${lastStartPayload.gameId}.name`),
                })}
              </button>
            )}
            <button
              onClick={() => socket.emit('player:release-remote-host')}
              style={{
                padding: '0.4rem 0.9rem',
                fontSize: '0.85rem',
                borderRadius: '0.5rem',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--bg-card)',
              }}
            >
              {t('lobby.releaseControl')}
            </button>
          </>
        ) : holder ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
            🎮 <strong>{holder.name}</strong> {t('lobby.holdsControl')}
          </p>
        ) : (
          <button
            onClick={() => socket.emit('player:claim-remote-host')}
            style={{
              padding: '0.7rem 1.3rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              borderRadius: '0.6rem',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
            }}
          >
            {t('lobby.claimControl')}
          </button>
        )}
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          {iAmRemoteHost
            ? t('lobby.canStartFromPhone')
            : t('lobby.waitingForHost')}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          justifyContent: 'center',
        }}
      >
        {room.players
          .filter((p) => 'name' in p)
          .map((p) => (
            <span
              key={p.id}
              style={{
                background: 'var(--bg-card)',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                borderLeft: `3px solid ${p.avatarColor}`,
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{p.avatarEmoji}</span>
              {p.name}
              {p.id === remoteHostId && ' 🎮'}
            </span>
          ))}
      </div>

      <LobbyChat />

      <div
        style={{
          marginTop: '0.5rem',
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
        }}
      >
        <LeaveRoomButton />
        {iAmRemoteHost && <CloseRoomButton />}
      </div>

      {pickerOpen && (
        <AvatarPickerModal
          currentColor={player.avatarColor}
          currentEmoji={player.avatarEmoji}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function AvatarPickerModal({
  currentColor,
  currentEmoji,
  onClose,
}: {
  currentColor: string;
  currentEmoji: string;
  onClose: () => void;
}) {
  const t = useT();
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
        zIndex: 1000,
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
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{t('lobby.changeAvatar')}</h2>
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
                    border: active
                      ? '3px solid #fff'
                      : '3px solid transparent',
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
                    background: active
                      ? 'var(--accent)'
                      : 'var(--bg-card)',
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
