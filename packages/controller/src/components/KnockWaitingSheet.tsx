import { GAME_DEFINITIONS, type KnockStatus } from '@igra/shared';
import { useT } from '../i18n/useT';
import { ACCENT_HEX } from '../utils/gameAccent';
import { useKnockStore } from '../store/knockStore';
import { BottomSheet } from './BottomSheet';

/**
 * The guest at the door (Pokucaj, 3d): who you are, who decides, and how far
 * the game has gone so you can guess the wait. Tapping the backdrop does
 * nothing — leaving the door is the explicit "Otkaži".
 */
export function KnockWaitingSheet({ status }: { status: KnockStatus }) {
  const t = useT();
  const cancel = useKnockStore((s) => s.cancel);
  const def = status.gameId ? GAME_DEFINITIONS[status.gameId] : undefined;
  const hex = def ? ACCENT_HEX[def.accent] : ACCENT_HEX.gold;
  const gameName = status.gameId ? t(`game.${status.gameId}.name`) : '';
  const admitted = status.state === 'admitted';

  const progressLine = status.progress
    ? t(status.progress.unit === 'question' ? 'knock.progressQuestion' : 'knock.progressRound', {
        game: gameName,
        current: status.progress.current,
        total: status.progress.total,
      })
    : gameName;

  // Bold the holder's name inside the translated sentence.
  const SPLIT = '\u0000';
  const holderParts = status.holderName
    ? t('knock.holderLine', { name: SPLIT }).split(SPLIT)
    : null;

  return (
    <BottomSheet label={t('knock.title', { code: status.roomCode })} onClose={() => {}}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '0 8px',
        }}
      >
        <span
          className="avatar-tile"
          style={{
            marginTop: 18,
            width: 88,
            height: 88,
            backgroundColor: status.avatarColor,
            fontSize: '2.75rem',
            boxShadow: '0 0 0 8px rgba(194,155,71,.14), 0 0 0 16px rgba(194,155,71,.07)',
            animation: admitted ? 'igra-pop .4s' : undefined,
          }}
        >
          {status.avatarEmoji}
        </span>
        <span
          className="display"
          style={{ marginTop: 22, fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.1 }}
        >
          {admitted ? t('knock.admittedTitle') : t('knock.title', { code: status.roomCode })}
        </span>
        <span
          style={{
            marginTop: 6,
            fontSize: '0.95rem',
            lineHeight: 1.4,
            color: 'var(--text-secondary)',
          }}
        >
          {admitted ? (
            t('knock.admittedLine', { code: status.roomCode })
          ) : holderParts ? (
            <>
              {holderParts[0]}
              <strong style={{ color: 'var(--text-primary)' }}>{status.holderName}</strong>
              {holderParts[1]}
            </>
          ) : (
            t('knock.noHolderLine')
          )}
        </span>

        <div
          style={{
            marginTop: 18,
            width: '100%',
            padding: '12px 14px',
            borderRadius: 16,
            background: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: hex + '2b',
              border: '1px solid ' + hex + '55',
              display: 'grid',
              placeItems: 'center',
              fontSize: '1.25rem',
              flexShrink: 0,
            }}
          >
            {def?.icon ?? '🎮'}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{progressLine}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {t('knock.playersInRoom', { n: status.playerCount })}
            </span>
          </span>
          {/* Three fading dots — "still waiting", without a spinner. */}
          <span aria-hidden style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--amber)',
                  animation: `igra-floaty 1.2s infinite ${i * 0.2}s`,
                }}
              />
            ))}
          </span>
        </div>

        <button
          className="btn-ghost"
          onClick={cancel}
          style={{ marginTop: 18, width: '100%', fontWeight: 800 }}
        >
          {t('knock.cancel')}
        </button>
      </div>
    </BottomSheet>
  );
}
