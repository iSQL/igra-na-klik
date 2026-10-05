import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MAX_PLAYERS_DEFAULT, ROOM_CODE_LENGTH } from '@igra/shared';
import { usePlayerStore } from '../store/playerStore';
import { useNavStore } from '../store/navStore';
import { useGameStore } from '../store/gameStore';
import { socket } from '../socket';
import { LeaveRoomButton } from '../components/LeaveRoomButton';
import { CloseRoomButton } from '../components/CloseRoomButton';
import { copyText, roomJoinUrl } from '../components/CopyRoomLinkButton';
import { ChatToggleButton } from '../components/ChatHead';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import { useT } from '../i18n/useT';

const iconButton: React.CSSProperties = {
  width: 44,
  height: 44,
  minWidth: 44,
  minHeight: 44,
  padding: 0,
  borderRadius: 14,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--line)',
  display: 'grid',
  placeItems: 'center',
  color: 'var(--text-secondary)',
};

export function LobbyScreen() {
  const { player, room } = usePlayerStore();
  const setScreen = useNavStore((s) => s.setScreen);
  const lastStartPayload = useGameStore((s) => s.lastStartPayload);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const players = room.players.filter((p) => 'name' in p);
  const joinUrl = roomJoinUrl(room.code);

  // Native share sheet where there is one (phones), clipboard otherwise —
  // plain-http LAN origins have neither navigator.share nor clipboard.
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: joinUrl, title: 'igra na KLIK' });
        return;
      } catch (e) {
        // AbortError = player closed the sheet; anything else → copy instead.
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    if (await copyText(joinUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '400px',
        alignSelf: 'stretch',
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: '0.9rem 0.2rem 0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setPickerOpen(true)}
            aria-label={t('lobby.changeAvatar')}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'transparent',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              color: 'var(--text-primary)',
            }}
          >
            <span
              className="avatar-tile"
              style={{
                width: 40,
                height: 40,
                backgroundColor: player.avatarColor,
                fontSize: '1.4rem',
              }}
            >
              {player.avatarEmoji}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '1rem',
                  lineHeight: 1.1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {player.name}
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {t('lobby.changeAvatar')}
              </span>
            </span>
          </button>
          <ChatToggleButton />
          <button
            onClick={() => setMenuOpen(true)}
            aria-label={t('lobby.menu')}
            style={{ ...iconButton, fontSize: '1.3rem', fontWeight: 800 }}
          >
            ⋯
          </button>
        </div>

        <div
          style={{
            marginTop: '1.4rem',
            padding: '1.1rem',
            borderRadius: 24,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--amber)',
              }}
            >
              {t('lobby.room')}
            </span>
            {room.hostless && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {t('lobby.inviteCrew')}
              </span>
            )}
          </div>
          <div
            aria-label={room.code}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${ROOM_CODE_LENGTH}, 1fr)`,
              gap: '0.6rem',
            }}
          >
            {room.code.split('').map((ch, i) => (
              <div
                key={i}
                className="display"
                style={{
                  height: 76,
                  borderRadius: 16,
                  background: 'var(--bg-primary)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: '2.75rem',
                  lineHeight: 1,
                }}
              >
                {ch}
              </div>
            ))}
          </div>
          {room.hostless && (
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                onClick={share}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  background: 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                }}
              >
                {copied ? t('room.copied') : t('lobby.share')}
              </button>
              <button
                onClick={() => setQrOpen(true)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: '1.5px solid var(--line2)',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                }}
              >
                {t('lobby.showQr')}
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <span className="display" style={{ fontWeight: 700, fontSize: '1.25rem' }}>
            {t('lobby.players')}
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
            {players.filter((p) => p.isConnected).length} / {MAX_PLAYERS_DEFAULT}
          </span>
        </div>

        <div
          style={{
            marginTop: '0.8rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.7rem 0.5rem',
          }}
        >
          {players.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                opacity: p.isConnected ? 1 : 0.5,
              }}
            >
              <span
                className="avatar-tile"
                style={{
                  position: 'relative',
                  width: 66,
                  height: 66,
                  backgroundColor: p.avatarColor,
                  fontSize: '2rem',
                  filter: p.isConnected ? 'none' : 'grayscale(.6)',
                  // The holder of the remote-host claim gets a gold ring.
                  boxShadow:
                    p.id === remoteHostId ? '0 0 0 2.5px var(--accent)' : 'none',
                }}
              >
                {p.avatarEmoji}
                <span
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: p.isConnected ? 'var(--success)' : 'var(--amber)',
                    border: '3px solid var(--bg-primary)',
                  }}
                />
                {iAmRemoteHost && p.id !== player.id && (
                  <button
                    onClick={() => setKickTarget({ id: p.id, name: p.name })}
                    aria-label={t('lobby.kick', { name: p.name })}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 24,
                      height: 24,
                      minWidth: 24,
                      minHeight: 24,
                      padding: 0,
                      borderRadius: '50%',
                      background: 'var(--bg-primary)',
                      border: '1px solid rgba(255,77,94,.5)',
                      color: 'var(--danger)',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.id === player.id ? `${p.name} · ${t('lobby.you')}` : p.name}
              </span>
            </div>
          ))}
          {room.hostless && players.length < MAX_PLAYERS_DEFAULT && (
            <button
              onClick={share}
              aria-label={t('lobby.invite')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--text-secondary)',
              }}
            >
              <span
                style={{
                  width: 66,
                  height: 66,
                  borderRadius: '30%',
                  border: '2px dashed var(--line2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '1.6rem',
                }}
              >
                ＋
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{t('lobby.invite')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary move lives at the bottom, in thumb reach. */}
      <div
        style={{
          padding: '0.9rem 0.2rem calc(1rem + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
          background: 'linear-gradient(180deg, rgba(22,46,78,0), var(--bg-primary) 30%)',
        }}
      >
        {iAmRemoteHost ? (
          <>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {lastStartPayload && (
                <button
                  className="btn-ghost"
                  onClick={() => socket.emit('host:start-game', lastStartPayload)}
                  aria-label={t('lobby.playAgain', {
                    name: t(`game.${lastStartPayload.gameId}.name`),
                  })}
                  style={{ minHeight: 56, padding: '0 1rem', whiteSpace: 'nowrap' }}
                >
                  🔁 {t(`game.${lastStartPayload.gameId}.name`)}
                </button>
              )}
              <button
                className="btn-primary"
                onClick={() => setScreen('game-select')}
                style={{ flex: 1 }}
              >
                {t('lobby.chooseGameArrow')}
              </button>
            </div>
            <span
              style={{
                textAlign: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              🎮 {t('lobby.youHoldControl')} ·{' '}
              <button
                onClick={() => socket.emit('player:release-remote-host')}
                style={{
                  display: 'inline',
                  minHeight: 'unset',
                  padding: '0.5rem 0.2rem',
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  font: 'inherit',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                {t('lobby.release')}
              </button>
            </span>
          </>
        ) : holder ? (
          <p
            style={{
              margin: 0,
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.95rem',
              fontWeight: 700,
            }}
          >
            🎮 <strong style={{ color: 'var(--text-primary)' }}>{holder.name}</strong>{' '}
            {t('lobby.holdsControl')}
            <br />
            <span style={{ color: 'var(--dim)', fontSize: '0.85rem' }}>
              {t('lobby.waitingForHost')}
            </span>
          </p>
        ) : (
          <>
            <button
              className="btn-primary"
              onClick={() => socket.emit('player:claim-remote-host')}
            >
              {t('lobby.claimControl')}
            </button>
            <span
              style={{
                textAlign: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--dim)',
              }}
            >
              {t('lobby.waitingForHost')}
            </span>
          </>
        )}
      </div>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11,22,40,.62)',
            zIndex: 900,
            animation: 'igra-fade .18s ease',
          }}
        >
          <div
            role="dialog"
            aria-label={t('lobby.menu')}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 0,
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 480,
              padding: '10px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              borderBottom: 'none',
              borderRadius: '28px 28px 0 0',
              animation: 'igra-sheet-up .26s cubic-bezier(.22,1,.36,1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 6 }}>
              <div style={{ width: 40, height: 5, borderRadius: 99, background: 'var(--line2)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <LanguageSwitch />
            </div>
            <LeaveRoomButton variant="menu" />
            {iAmRemoteHost && <CloseRoomButton variant="menu" />}
          </div>
        </div>
      )}

      {qrOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setQrOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11,22,40,.92)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.2rem',
            padding: '1.5rem',
          }}
        >
          <QRCodeSVG
            value={joinUrl}
            size={260}
            bgColor="#F5EBE0"
            fgColor="#1D3557"
            level="M"
            style={{ borderRadius: 16, padding: 14, background: '#F5EBE0' }}
          />
          <div className="display" style={{ fontWeight: 700, fontSize: '2.6rem', letterSpacing: '0.18em' }}>
            {room.code}
          </div>
          <button className="btn-ghost" style={{ padding: '0 1.6rem' }}>
            {t('lobby.hideQr')}
          </button>
        </div>
      )}

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
