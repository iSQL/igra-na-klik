import { useEffect, useState } from 'react';
import type { PublicPlayer } from '@igra/shared';
import { socket } from '../socket';
import { useT } from '../i18n/useT';
import { usePlayerStore } from '../store/playerStore';
import { useKnockStore } from '../store/knockStore';
import { flowAction, formatClock, useFlowStore } from '../store/flowStore';
import { useTwoTap } from '../hooks/useTwoTap';
import { KnockButtons, KnockFace } from './KnockBanner';
import { SectionLabel } from './PlayerMenu';

/**
 * The holder's "Igrači" screen during a game (Tok igre 1b): guests at the
 * door, then everyone in the game with a live status that answers "who are
 * we waiting for?", and per-player actions — hand over hosting, stop waiting
 * for them, kick. Opened from the player menu; full screen like RulesScreen.
 */
export function PlayersPanel() {
  const t = useT();
  const panel = useFlowStore((s) => s.panel);
  const setPanel = useFlowStore((s) => s.setPanel);
  const flow = useFlowStore((s) => s.flow);
  const offlineSince = useFlowStore((s) => s.offlineSince);
  const me = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const knocks = useKnockStore((s) => s.requests);
  const answerKnock = useKnockStore((s) => s.answer);
  const [selected, setSelected] = useState<string | null>(null);
  const { armed, tap } = useTwoTap();
  const [, setNow] = useState(0);

  const open = panel === 'players';
  const anyOffline = !!room?.players.some((p) => !p.isConnected);
  // Re-render once a second while someone is offline, for their m:ss.
  useEffect(() => {
    if (!open || !anyOffline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, anyOffline]);

  const iAmHolder = !!me && room?.remoteHostPlayerId === me.id;
  // Control moved away while the panel was open — nothing here is ours now.
  useEffect(() => {
    if (open && !iAmHolder) setPanel(null);
  }, [open, iAmHolder, setPanel]);

  if (!open || !me || !room || !iAmHolder) return null;

  const collection = flow?.collection ?? null;
  const done = new Set(collection?.doneIds ?? []);
  const expected = new Set(collection?.expectedIds ?? []);
  const notWaiting = new Set(flow?.notWaitingIds ?? []);

  const statusOf = (p: PublicPlayer): { text: string; color: string } => {
    const lead =
      p.id === room.remoteHostPlayerId
        ? `${p.id === me.id ? t('players.youHost') : t('players.hosting')} · `
        : '';
    if (!p.isConnected) {
      const since = offlineSince[p.id];
      const text = since
        ? t('players.status.offline', { time: formatClock((Date.now() - since) / 1000) })
        : t('playerMenu.offline', { n: 1 });
      return { text: lead + text, color: 'var(--danger)' };
    }
    if (notWaiting.has(p.id)) {
      return { text: lead + t('players.status.notWaiting'), color: 'var(--dim)' };
    }
    if (collection && expected.has(p.id) && collection.doneIds) {
      return done.has(p.id)
        ? { text: lead + t(`players.status.${collection.verb}`), color: 'var(--success-ink)' }
        : { text: lead + t('players.status.thinking'), color: 'var(--text-secondary)' };
    }
    return {
      text: lead + t('players.status.online'),
      color: lead ? 'var(--amber)' : 'var(--text-secondary)',
    };
  };

  const target = selected ? room.players.find((p) => p.id === selected) ?? null : null;
  const canStopWaiting =
    !!target &&
    !!collection?.doneIds &&
    expected.has(target.id) &&
    !done.has(target.id) &&
    !notWaiting.has(target.id) &&
    !flow?.paused;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('playerMenu.players')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1150,
        background:
          'radial-gradient(1200px 700px at 50% -12%, rgba(194,155,71,.16), transparent 60%), var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        padding:
          'calc(16px + var(--safe-top)) calc(16px + var(--safe-right)) calc(16px + var(--safe-bottom)) calc(16px + var(--safe-left))',
        gap: 10,
        overflowY: 'auto',
        animation: 'igra-fade .18s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setPanel(null)}
          aria-label={t('common.back')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--line)',
            color: 'var(--text-primary)',
            fontSize: '1.4rem',
            fontWeight: 800,
          }}
        >
          ‹
        </button>
        <span className="display" style={{ flex: 1, fontWeight: 700, fontSize: '1.5rem' }}>
          {t('players.title', { n: room.players.length })}
        </span>
      </div>

      {knocks.length > 0 && (
        <>
          <SectionLabel accent>{t('knock.atTheDoor')}</SectionLabel>
          {knocks.map((k) => (
            <div
              key={k.knockId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 10px 10px 12px',
                borderRadius: 16,
                background: 'var(--bg-secondary)',
                border: '1.5px solid var(--accent)',
              }}
            >
              <KnockFace request={k} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{k.name}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {t(k.entry === 'next-round' ? 'knock.entryNext' : 'knock.entryAfter')}
                </span>
              </span>
              <KnockButtons request={k} onAnswer={answerKnock} onDark />
            </div>
          ))}
        </>
      )}

      <SectionLabel>{t('players.inGame')}</SectionLabel>
      {room.players.map((p) => {
        const st = statusOf(p);
        const isMe = p.id === me.id;
        const isSel = p.id === selected;
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 58,
              padding: '0 8px 0 12px',
              borderRadius: 16,
              background: isSel ? 'var(--bg-secondary)' : 'rgba(245,235,224,.05)',
              border: isSel ? '1px solid var(--line2)' : '1px solid transparent',
              opacity: p.isConnected ? 1 : 0.6,
            }}
          >
            <span
              className="avatar-tile"
              style={{ width: 38, height: 38, backgroundColor: p.avatarColor, fontSize: '1.2rem' }}
            >
              {p.avatarEmoji}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name} {isMe && t('players.you')}
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: st.color }}>{st.text}</span>
            </span>
            {!isMe && (
              <button
                onClick={() => setSelected(isSel ? null : p.id)}
                aria-label={t('players.actionsFor', { name: p.name })}
                aria-expanded={isSel}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--dim)',
                  fontSize: '1.3rem',
                }}
              >
                ⋯
              </button>
            )}
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      {target && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            padding: 14,
            borderRadius: 18,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--line2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            animation: 'igra-slide-up .22s cubic-bezier(.22,1,.36,1)',
          }}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
            {target.avatarEmoji} {target.name}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {target.isConnected && (
              <ActionChip
                armed={armed === 'host'}
                onClick={() =>
                  tap('host', () => {
                    socket.emit('host:transfer-remote-host', { playerId: target.id });
                    setSelected(null);
                  })
                }
              >
                {armed === 'host' ? t('flow.sure') : t('players.makeHost')}
              </ActionChip>
            )}
            {canStopWaiting && (
              <ActionChip
                onClick={() => {
                  flowAction('stop-waiting', target.id);
                  setSelected(null);
                }}
              >
                {t('players.dontWait')}
              </ActionChip>
            )}
            <ActionChip
              danger
              armed={armed === 'kick'}
              onClick={() =>
                tap('kick', () => {
                  socket.emit('host:kick-player', { playerId: target.id });
                  setSelected(null);
                })
              }
            >
              {armed === 'kick' ? t('flow.sure') : t('players.kick')}
            </ActionChip>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionChip({
  danger,
  armed,
  onClick,
  children,
}: {
  danger?: boolean;
  armed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 40,
        padding: '0 14px',
        borderRadius: 999,
        border: armed ? '1.5px solid currentColor' : '1.5px solid transparent',
        background: danger ? 'rgba(224,106,94,.14)' : 'rgba(245,235,224,.08)',
        color: danger ? 'var(--danger)' : 'var(--text-primary)',
        fontSize: '0.85rem',
        fontWeight: 800,
      }}
    >
      {children}
    </button>
  );
}
