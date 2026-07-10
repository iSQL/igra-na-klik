import { useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useNavStore } from '../store/navStore';
import { useGameStore } from '../store/gameStore';
import { socket } from '../socket';
import { LeaveRoomButton } from '../components/LeaveRoomButton';
import { CloseRoomButton } from '../components/CloseRoomButton';
import { CopyRoomLinkButton } from '../components/CopyRoomLinkButton';
import { LobbyChat } from '../components/LobbyChat';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import { useT } from '../i18n/useT';

export function LobbyScreen() {
  const { player, room } = usePlayerStore();
  const setScreen = useNavStore((s) => s.setScreen);
  const lastStartPayload = useGameStore((s) => s.lastStartPayload);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; name: string } | null>(
    null
  );
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
              {iAmRemoteHost && p.id !== player.id && (
                <button
                  onClick={() => setKickTarget({ id: p.id, name: p.name })}
                  aria-label={t('lobby.kick', { name: p.name })}
                  style={{
                    width: '28px',
                    height: '28px',
                    minWidth: '28px',
                    minHeight: '28px',
                    padding: 0,
                    borderRadius: '50%',
                    background: 'rgba(255,77,94,.14)',
                    border: '1px solid rgba(255,77,94,.4)',
                    color: 'var(--danger)',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
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
          currentName={player.name}
          currentColor={player.avatarColor}
          currentEmoji={player.avatarEmoji}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {kickTarget && (
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
              {t('lobby.kickConfirm', { name: kickTarget.name })}
            </h2>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                onClick={() => setKickTarget(null)}
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
                onClick={() => {
                  socket.emit('host:kick-player', { playerId: kickTarget.id });
                  setKickTarget(null);
                }}
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
                {t('lobby.kickAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
