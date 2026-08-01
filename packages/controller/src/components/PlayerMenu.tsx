import { useState } from 'react';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { useT } from '../i18n/useT';
import { AvatarPickerModal } from './AvatarPickerModal';
import { LanguageSwitch } from './LanguageSwitch';
import { QuizFeedbackMenu } from './QuizFeedbackMenu';
import { BitkaBoardMenu } from './BitkaBoardMenu';

type ConfirmKind = 'leave' | 'close' | 'stop' | null;

/**
 * Single round button (the player's avatar) that opens a popup with all
 * player-scoped actions — change look, language, and the destructive
 * leave/close/end-game — instead of scattering pill buttons over the game
 * where they overlapped game elements.
 */
export function PlayerMenu({ inGame = false }: { inGame?: boolean }) {
  const player = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const t = useT();
  const [open, setOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  if (!player || !room) return null;

  const iAmRemoteHost = room.remoteHostPlayerId === player.id;

  const confirmDialog = (() => {
    if (!confirm) return null;
    if (confirm === 'stop') {
      return {
        title: t('overlay.endGameConfirmTitle'),
        body: t('overlay.endGameConfirmBody'),
        cta: t('overlay.end'),
        run: () => socket.emit('host:stop-game'),
      };
    }
    if (confirm === 'close') {
      return {
        title: t('closeRoom.confirmTitle'),
        body: t('closeRoom.confirmBody'),
        cta: t('closeRoom.confirm'),
        run: () => socket.emit('host:close-room'),
      };
    }
    return {
      title: t('leave.confirmTitle'),
      body: iAmRemoteHost
        ? room.hostless
          ? t('leave.confirmBodyHostlessHost')
          : t('leave.confirmBodyRemoteHost')
        : t('leave.confirmBody'),
      cta: t('leave.exit'),
      run: () => socket.emit('player:leave-room'),
    };
  })();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('playerMenu.open')}
        style={{
          position: 'relative',
          width: '46px',
          height: '46px',
          minWidth: '46px',
          minHeight: '46px',
          padding: 0,
          borderRadius: '50%',
          background: player.avatarColor,
          border: '1px solid var(--line2)',
          boxShadow: '0 2px 10px rgba(0,0,0,.45)',
          fontSize: '1.4rem',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {player.avatarEmoji}
        <span
          style={{
            position: 'absolute',
            right: '-3px',
            bottom: '-3px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--line2)',
            fontSize: '0.7rem',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          ⚙
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11,10,23,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1.25rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              borderRadius: '20px',
              padding: '1.1rem',
              width: '100%',
              maxWidth: '22rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              animation: 'igra-pop .22s',
            }}
          >
            {/* Header: avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <span
                className="avatar-tile"
                style={{
                  width: '44px',
                  height: '44px',
                  backgroundColor: player.avatarColor,
                  fontSize: '1.4rem',
                }}
              >
                {player.avatarEmoji}
              </span>
              <span style={{ flex: 1, fontWeight: 800, fontSize: '1.05rem', minWidth: 0 }}>
                {player.name}
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                style={{
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: 'none',
                  fontSize: '1.5rem',
                  padding: '0 0.25rem',
                }}
              >
                ×
              </button>
            </div>

            {/* Language */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                padding: '0.15rem 0.15rem',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {t('playerMenu.language')}
              </span>
              <LanguageSwitch />
            </div>

            {/* Change look */}
            <MenuRow
              icon="🎨"
              label={t('lobby.changeAvatar')}
              onClick={() => {
                setOpen(false);
                setAvatarOpen(true);
              }}
            />

            {/* Kviz: report/rate the current question (renders only when a
                kviz question is on screen). */}
            <QuizFeedbackMenu />

            {/* Osvajanje: spisak teritorija + tabla (renderuje se samo u toj
                igri). Izbor sa spiska zatvara popup da bi se videla mapa. */}
            <BitkaBoardMenu onPicked={() => setOpen(false)} />

            <div style={{ height: '1px', background: 'var(--line2)', margin: '0.15rem 0' }} />

            {inGame && iAmRemoteHost && (
              <MenuRow
                icon="⏹"
                label={t('overlay.endGame')}
                danger
                onClick={() => {
                  setOpen(false);
                  setConfirm('stop');
                }}
              />
            )}
            {iAmRemoteHost && room.hostless && (
              <MenuRow
                icon="🚫"
                label={t('closeRoom.button')}
                danger
                onClick={() => {
                  setOpen(false);
                  setConfirm('close');
                }}
              />
            )}
            <MenuRow
              icon="🚪"
              label={t('leave.leaveRoom')}
              danger
              onClick={() => {
                setOpen(false);
                setConfirm('leave');
              }}
            />
          </div>
        </div>
      )}

      {confirmDialog && (
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
            zIndex: 1300,
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
              {confirmDialog.title}
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
              {confirmDialog.body}
            </p>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                onClick={() => setConfirm(null)}
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
                  confirmDialog.run();
                  setConfirm(null);
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
                {confirmDialog.cta}
              </button>
            </div>
          </div>
        </div>
      )}

      {avatarOpen && (
        <AvatarPickerModal
          currentName={player.name}
          currentColor={player.avatarColor}
          currentEmoji={player.avatarEmoji}
          onClose={() => setAvatarOpen(false)}
        />
      )}
    </>
  );
}

function MenuRow({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.7rem',
        width: '100%',
        padding: '0.7rem 0.8rem',
        borderRadius: '12px',
        background: danger ? 'rgba(255,77,94,.12)' : 'var(--bg-card)',
        border: `1px solid ${danger ? 'rgba(255,77,94,.4)' : 'var(--line2)'}`,
        color: danger ? 'var(--danger)' : 'var(--text-primary)',
        fontWeight: 800,
        fontSize: '0.95rem',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
