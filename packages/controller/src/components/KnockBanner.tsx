import { useEffect, useRef } from 'react';
import type { KnockRequest } from '@igra/shared';
import { useT } from '../i18n/useT';
import { useKnockStore } from '../store/knockStore';
import { cue } from '../utils/cues';

// How long the banner stays before folding into the ✊ badge on the avatar.
const COLLAPSE_MS = 8000;

/**
 * Someone is at the door (Pokucaj, 3e) — only the remote-host holder ever has
 * requests, so only they see this. It slides over the header strip and
 * nothing else, so the answers below stay tappable; a tap anywhere outside
 * (answering, say) folds it away, as does doing nothing for 8 s. Folded
 * requests wait in the player menu, behind the ✊ badge.
 */
export function KnockBanner() {
  const requests = useKnockStore((s) => s.requests);
  const collapsed = useKnockStore((s) => s.collapsed);
  const visible = requests.find((r) => !collapsed.includes(r.knockId));
  if (!visible) return null;
  // Keyed by knock, so the timer restarts for the next guest in line.
  return <Banner key={visible.knockId} request={visible} />;
}

function Banner({ request }: { request: KnockRequest }) {
  const t = useT();
  const answer = useKnockStore((s) => s.answer);
  const collapse = useKnockStore((s) => s.collapse);
  const ref = useRef<HTMLDivElement>(null);

  // Kuc-kuc once per guest (keyed banner = one mount per knock).
  useEffect(() => {
    cue('knock');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => collapse(request.knockId), COLLAPSE_MS);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) collapse(request.knockId);
    };
    // Capture phase: the tap still reaches the answer button underneath.
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [request.knockId, collapse]);

  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-label={t('knock.isKnocking', { name: request.name })}
      style={{
        position: 'fixed',
        top: 'calc(10px + var(--safe-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 20px)',
        maxWidth: 500,
        minHeight: 64,
        padding: '8px 8px 8px 10px',
        borderRadius: 20,
        background: 'var(--text-primary)',
        color: 'var(--bg-primary)',
        boxShadow: '0 14px 32px rgba(0,0,0,.45)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        zIndex: 1050,
        animation: 'igra-banner-in .28s cubic-bezier(.22,1,.36,1)',
      }}
    >
      <KnockFace request={request} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontWeight: 800,
            fontSize: '0.95rem',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t('knock.isKnocking', { name: request.name })}
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#5B5548', lineHeight: 1.25 }}>
          {t(request.entry === 'next-round' ? 'knock.entryNext' : 'knock.entryAfter')}
        </span>
      </span>
      <KnockButtons request={request} onAnswer={answer} />
    </div>
  );
}

export function KnockFace({ request }: { request: KnockRequest }) {
  return (
    <span
      className="avatar-tile"
      style={{
        position: 'relative',
        width: 40,
        height: 40,
        backgroundColor: request.avatarColor,
        fontSize: '1.25rem',
      }}
    >
      {request.avatarEmoji}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -6,
          bottom: -6,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--text-primary)',
          display: 'grid',
          placeItems: 'center',
          fontSize: '0.75rem',
        }}
      >
        ✊
      </span>
    </span>
  );
}

/** "Ne sad" + "Pusti", shared by the banner and the player-menu list. */
export function KnockButtons({
  request,
  onAnswer,
  onDark = false,
}: {
  request: KnockRequest;
  onAnswer: (knockId: string, admit: boolean) => void;
  /** Rendered on the navy menu rather than the cream banner. */
  onDark?: boolean;
}) {
  const t = useT();
  return (
    <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <button
        onClick={() => onAnswer(request.knockId, false)}
        style={{
          height: 40,
          minHeight: 40,
          padding: '0 12px',
          borderRadius: 12,
          background: 'transparent',
          color: onDark ? 'var(--text-primary)' : 'var(--bg-primary)',
          border: onDark ? '1.5px solid var(--line2)' : '1.5px solid rgba(29,53,87,.2)',
          fontWeight: 800,
          fontSize: '0.88rem',
        }}
      >
        {t('knock.notNow')}
      </button>
      <button
        onClick={() => onAnswer(request.knockId, true)}
        style={{
          height: 40,
          minHeight: 40,
          padding: '0 14px',
          borderRadius: 12,
          background: onDark ? 'var(--accent)' : 'var(--bg-secondary)',
          color: onDark ? 'var(--bg-primary)' : 'var(--text-primary)',
          border: 'none',
          fontWeight: 800,
          fontSize: '0.88rem',
        }}
      >
        {t('knock.letIn')}
      </button>
    </span>
  );
}
