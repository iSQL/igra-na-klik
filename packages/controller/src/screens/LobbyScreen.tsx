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

  const connectedCount = room.players.filter((p) => p.isConnected).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        width: '100%',
        maxWidth: '400px',
        alignSelf: 'stretch',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => setPickerOpen(true)}
          aria-label={t('lobby.changeAvatar')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '0.35rem 0.8rem 0.35rem 0.35rem',
            color: 'var(--text-primary)',
          }}
        >
          <span
            className="avatar-tile"
            style={{
              width: '42px',
              height: '42px',
              backgroundColor: player.avatarColor,
              fontSize: '1.4rem',
            }}
          >
            {player.avatarEmoji}
          </span>
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>{player.name}</span>
        </button>
        <LanguageSwitch />
      </div>

      <div
        style={{
          borderRadius: '20px',
          background: 'var(--grad)',
          padding: '1rem 1.2rem',
          textAlign: 'center',
          boxShadow: '0 14px 34px rgba(194,155,71,.4)',
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,.8)',
            fontSize: '0.72rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
          }}
        >
          {t('lobby.room')}
        </div>
        <div
          className="display"
          style={{
            fontWeight: 700,
            fontSize: '3.2rem',
            lineHeight: 1,
            letterSpacing: '0.12em',
            color: '#fff',
          }}
        >
          {room.code}
        </div>
        {room.hostless && (
          <div style={{ marginTop: '0.4rem' }}>
            <CopyRoomLinkButton code={room.code} />
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        {iAmRemoteHost ? (
          <>
            <button
              className="btn-primary"
              onClick={() => setScreen('game-select')}
              style={{ width: '100%' }}
            >
              {t('lobby.chooseGameArrow')}
            </button>
            {lastStartPayload && (
              <button
                className="btn-ghost"
                onClick={() => socket.emit('host:start-game', lastStartPayload)}
                style={{ width: '100%' }}
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
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: '10px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--line)',
                minHeight: '40px',
              }}
            >
              {t('lobby.releaseControl')}
            </button>
          </>
        ) : holder ? (
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.95rem',
              fontWeight: 700,
              margin: 0,
            }}
          >
            🎮 <strong style={{ color: 'var(--text-primary)' }}>{holder.name}</strong>{' '}
            {t('lobby.holdsControl')}
          </p>
        ) : (
          <button
            className="btn-primary"
            onClick={() => socket.emit('player:claim-remote-host')}
            style={{ width: '100%' }}
          >
            {t('lobby.claimControl')}
          </button>
        )}
        <p
          style={{
            color: 'var(--dim)',
            fontSize: '0.85rem',
            fontWeight: 700,
            margin: 0,
          }}
        >
          {iAmRemoteHost
            ? t('lobby.canStartFromPhone')
            : t('lobby.waitingForHost')}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
          {t('lobby.players')}{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            {connectedCount}/{room.players.length}
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {room.players
          .filter((p) => 'name' in p)
          .map((p) => (
            <div
              key={p.id}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 0.85rem',
                borderRadius: '14px',
                opacity: p.isConnected ? 1 : 0.5,
              }}
            >
              <span
                className="avatar-tile"
                style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: p.avatarColor,
                  fontSize: '1.3rem',
                  filter: p.isConnected ? 'none' : 'grayscale(.6)',
                }}
              >
                {p.avatarEmoji}
              </span>
              <span style={{ flex: 1, fontWeight: 800, fontSize: '0.95rem', textAlign: 'left' }}>
                {p.name}
              </span>
              {p.id === player.id && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    color: 'var(--amber)',
                    background: 'rgba(227,180,94,.14)',
                    padding: '3px 8px',
                    borderRadius: '7px',
                  }}
                >
                  {t('lobby.you')}
                </span>
              )}
              {p.id === remoteHostId && <span style={{ fontSize: '0.9rem' }}>🎮</span>}
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: p.isConnected ? 'var(--success)' : 'var(--amber)',
                  boxShadow: p.isConnected ? '0 0 8px var(--success)' : 'none',
                  flexShrink: 0,
                }}
              />
            </div>
          ))}
      </div>

      <LobbyChat />

      <div
        style={{
          marginTop: '0.25rem',
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          justifyContent: 'center',
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
