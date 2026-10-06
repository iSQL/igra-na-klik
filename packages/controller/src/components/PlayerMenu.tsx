import { useState, type ReactNode } from 'react';
import { GAME_DEFINITIONS } from '@igra/shared';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { leaveRoom } from '../leaveRoom';
import { useT } from '../i18n/useT';
import { AvatarPickerModal } from './AvatarPickerModal';
import { QuizFeedbackMenu } from './QuizFeedbackMenu';
import { BitkaBoardMenu } from './BitkaBoardMenu';
import { useKnockStore } from '../store/knockStore';
import { useRulesStore } from './RulesScreen';
import { BottomSheet } from './BottomSheet';
import { previewSound, useCueSettings, vibrate } from '../utils/cues';
import { useLanguageStore } from '../store/languageStore';
import { useGameStore } from '../store/gameStore';
import { flowAction, useFlowStore } from '../store/flowStore';

type ConfirmKind = 'leave' | 'close' | null;

/** The running game's name, translated where a card name exists. */
export function useGameName(): string {
  const t = useT();
  const gameId = useGameStore((s) => s.gameId);
  if (!gameId) return '';
  const key = `game.${gameId}.name`;
  const name = t(key);
  return name === key ? (GAME_DEFINITIONS[gameId]?.name ?? gameId) : name;
}

/**
 * Single round button (the player's avatar) that opens the player menu — a
 * bottom sheet the thumb reaches entirely (Tok igre 1a). Grouped: "Igra"
 * (the holder's pause / skip / players, plus game-specific rows), "Ja"
 * (per-device settings), then the dangerous actions apart. Guests at the
 * door moved to the holder's "Igrači" screen; the ✊ count stays on the
 * avatar.
 */
export function PlayerMenu({
  inGame = false,
  variant = 'floating',
}: {
  inGame?: boolean;
  /** 'header' = 40px, flat, sits inside the GameFrame header bar. */
  variant?: 'floating' | 'header';
}) {
  const player = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const t = useT();
  const [open, setOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const knocks = useKnockStore((s) => s.requests);
  const flow = useFlowStore((s) => s.flow);
  const setPanel = useFlowStore((s) => s.setPanel);
  const cues = useCueSettings();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const gameName = useGameName();

  if (!player || !room) return null;

  const iAmRemoteHost = room.remoteHostPlayerId === player.id;
  const offlineCount = room.players.filter((p) => !p.isConnected).length;

  const confirmDialog = (() => {
    if (!confirm) return null;
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
      run: () => leaveRoom(),
    };
  })();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('playerMenu.open')}
        style={{
          position: 'relative',
          width: variant === 'header' ? '40px' : '46px',
          height: variant === 'header' ? '40px' : '46px',
          minWidth: variant === 'header' ? '40px' : '46px',
          minHeight: variant === 'header' ? '40px' : '46px',
          flexShrink: 0,
          padding: 0,
          borderRadius: '50%',
          background: player.avatarColor,
          border: variant === 'header' ? 'none' : '1px solid var(--line2)',
          boxShadow: variant === 'header' ? 'none' : '0 2px 10px rgba(0,0,0,.45)',
          fontSize: variant === 'header' ? '1.25rem' : '1.4rem',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {player.avatarEmoji}
        {knocks.length > 0 ? (
          // Guests at the door whose banner was folded away: ✊ N.
          <span
            aria-label={t('knock.atTheDoor')}
            style={{
              position: 'absolute',
              right: '-6px',
              bottom: '-5px',
              height: '20px',
              padding: '0 5px',
              borderRadius: '10px',
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              fontSize: '0.68rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              animation: 'igra-pop .3s',
            }}
          >
            ✊{knocks.length}
          </span>
        ) : (
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
        )}
      </button>

      {open && (
        <BottomSheet label={t('playerMenu.open')} onClose={() => setOpen(false)} zIndex={1100}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px' }}>
            {/* Header: avatar, name, who runs the room */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                className="avatar-tile"
                style={{
                  width: 44,
                  height: 44,
                  backgroundColor: player.avatarColor,
                  fontSize: '1.4rem',
                }}
              >
                {player.avatarEmoji}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{player.name}</span>
                {iAmRemoteHost && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--amber)' }}>
                    {t('playerMenu.leading', { code: room.code })}
                  </span>
                )}
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                style={{
                  width: 44,
                  height: 44,
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: 'none',
                  fontSize: '1.5rem',
                }}
              >
                ×
              </button>
            </div>

            {/* Igra — the holder's controls + game-specific rows (everyone) */}
            {inGame && (
              <>
                <SectionLabel accent>{t('playerMenu.gameSection', { game: gameName })}</SectionLabel>
                {iAmRemoteHost && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: flow?.skipLabel ? '1fr 1fr' : '1fr',
                      gap: 8,
                    }}
                  >
                    <BigTile
                      icon={flow?.paused ? '▶' : '⏸'}
                      label={flow?.paused ? t('flow.resume') : t('flow.pause')}
                      disabled={!flow || !!flow.resumeCountdown}
                      onClick={() => {
                        setOpen(false);
                        flowAction(flow?.paused ? 'resume' : 'pause');
                      }}
                    />
                    {flow?.skipLabel && (
                      <BigTile
                        icon="⏭"
                        label={flow.skipLabel}
                        disabled={flow.paused}
                        onClick={() => {
                          setOpen(false);
                          flowAction('skip');
                        }}
                      />
                    )}
                  </div>
                )}
                {iAmRemoteHost && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      setPanel('players');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 56,
                      padding: '0 14px',
                      borderRadius: 14,
                      background: 'var(--bg-primary)',
                      border: 'none',
                      color: 'var(--text-primary)',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>👥</span>
                    <span style={{ flex: 1, fontWeight: 800, fontSize: '0.95rem' }}>
                      {t('playerMenu.players')}
                    </span>
                    {offlineCount > 0 && (
                      <Chip tone="danger">{t('playerMenu.offline', { n: offlineCount })}</Chip>
                    )}
                    {knocks.length > 0 && <Chip tone="gold">✊ {knocks.length}</Chip>}
                    <span aria-hidden style={{ color: 'var(--dim)', fontSize: '1.2rem' }}>
                      ›
                    </span>
                  </button>
                )}
                {/* Kviz: report/rate the current question (renders only when a
                    kviz question is on screen). */}
                <QuizFeedbackMenu />
                {/* Osvajanje: spisak teritorija + tabla (samo u toj igri).
                    Izbor sa spiska zatvara meni da bi se videla mapa. */}
                <BitkaBoardMenu onPicked={() => setOpen(false)} />
              </>
            )}

            {/* Ja — per-device settings */}
            <SectionLabel>{t('playerMenu.me')}</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              <SmallTile
                icon="📖"
                label={t('playerMenu.rules')}
                onClick={() => {
                  setOpen(false);
                  useRulesStore.getState().show();
                }}
              />
              <SmallTile
                icon="🎨"
                label={t('playerMenu.look')}
                onClick={() => {
                  setOpen(false);
                  setAvatarOpen(true);
                }}
              />
              <SmallTile
                icon="📳"
                label={t('playerMenu.vibration')}
                on={cues.vibration}
                onClick={() => {
                  cues.setVibration(!cues.vibration);
                  if (!cues.vibration) vibrate(30);
                }}
              />
              <SmallTile
                icon={cues.sound ? '🔊' : '🔈'}
                label={t('playerMenu.sound')}
                on={cues.sound}
                onClick={() => {
                  cues.setSound(!cues.sound);
                  if (!cues.sound) previewSound();
                }}
              />
              <SmallTile
                icon="🌐"
                label={language.toUpperCase()}
                onClick={() => setLanguage(language === 'sr' ? 'en' : 'sr')}
              />
            </div>

            <div style={{ height: 1, background: 'var(--line2)', margin: '4px 0' }} />

            {/* Dangerous actions, kept apart from the rest. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: inGame && iAmRemoteHost ? '1fr 1fr' : '1fr',
                gap: 8,
              }}
            >
              {inGame && iAmRemoteHost && (
                <DangerButton
                  strong
                  onClick={() => {
                    setOpen(false);
                    setPanel('end');
                  }}
                >
                  ⏹ {t('overlay.endGame')}
                </DangerButton>
              )}
              <DangerButton
                onClick={() => {
                  setOpen(false);
                  setConfirm('leave');
                }}
              >
                🚪 {t('leave.leaveRoom')}
              </DangerButton>
            </div>
            {iAmRemoteHost && room.hostless && (
              <DangerButton
                onClick={() => {
                  setOpen(false);
                  setConfirm('close');
                }}
              >
                🚫 {t('closeRoom.button')}
              </DangerButton>
            )}
          </div>
        </BottomSheet>
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

export function SectionLabel({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      style={{
        marginTop: 4,
        fontSize: '0.7rem',
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: accent ? 'var(--amber)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </span>
  );
}

function BigTile({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 72,
        borderRadius: 16,
        background: 'var(--bg-primary)',
        border: '1px solid var(--line)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>{label}</span>
    </button>
  );
}

function SmallTile({
  icon,
  label,
  on,
  onClick,
}: {
  icon: string;
  label: string;
  /** Toggle tiles: lit while on. */
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        height: 64,
        minWidth: 0,
        padding: '0 2px',
        borderRadius: 14,
        background: on ? 'rgba(194,155,71,.16)' : 'var(--bg-primary)',
        border: on ? '1px solid var(--accent)' : '1px solid transparent',
        color: on === false ? 'var(--dim)' : 'var(--text-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        fontSize: '0.72rem',
        fontWeight: 800,
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
    </button>
  );
}

export function Chip({
  tone,
  children,
}: {
  tone: 'danger' | 'gold' | 'plain';
  children: ReactNode;
}) {
  return (
    <span
      style={{
        height: 26,
        padding: '0 9px',
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        fontSize: '0.75rem',
        fontWeight: 800,
        background:
          tone === 'gold'
            ? 'var(--accent)'
            : tone === 'danger'
              ? 'rgba(224,106,94,.2)'
              : 'rgba(245,235,224,.08)',
        color:
          tone === 'gold'
            ? 'var(--bg-primary)'
            : tone === 'danger'
              ? 'var(--danger)'
              : 'var(--text-primary)',
      }}
    >
      {children}
    </span>
  );
}

function DangerButton({
  strong,
  onClick,
  children,
}: {
  strong?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 52,
        borderRadius: 14,
        background: strong ? 'rgba(224,106,94,.12)' : 'transparent',
        border: strong ? '1px solid rgba(224,106,94,.4)' : '1px solid var(--line2)',
        color: strong ? 'var(--danger)' : 'var(--text-secondary)',
        fontWeight: 800,
        fontSize: '0.9rem',
      }}
    >
      {children}
    </button>
  );
}
