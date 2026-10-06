import type { ReactNode } from 'react';

/**
 * The app's one menu pattern: a sheet sliding up from the bottom over a dim
 * backdrop, with a grab handle. Tapping the backdrop closes it. Used by the
 * start screen's ⋯ menu, the "Igraj na TV-u" steps and the lobby menu (the
 * game-settings sheet in GameSelectScreen has the same look).
 */
export function BottomSheet({
  label,
  onClose,
  children,
  zIndex = 900,
}: {
  /** Accessible name of the dialog. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** In a game the sheet must clear the GameFrame, overlays and hints. */
  zIndex?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,22,40,.62)',
        zIndex,
        animation: 'igra-fade .18s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 480,
          maxHeight: '92%',
          overflowY: 'auto',
          padding: '0 12px calc(24px + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--line2)',
          borderBottom: 'none',
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -18px 50px rgba(0,0,0,.45)',
          animation: 'igra-sheet-up .26s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
          <div style={{ width: 40, height: 5, borderRadius: 99, background: 'var(--line2)' }} />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Big tappable row: icon tile, title, one-line explanation, chevron. */
export function SheetRow({
  icon,
  tint,
  title,
  hint,
  onClick,
  href,
  newTab,
}: {
  icon: string;
  /** Hex accent for the icon tile. */
  tint: string;
  title: string;
  hint: string;
  onClick?: () => void;
  href?: string;
  /** Open href in a new tab — in a room, so leaving doesn't drop the socket. */
  newTab?: boolean;
}) {
  const content = (
    <>
      <span
        aria-hidden
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: tint + '2b',
          border: '1px solid ' + tint + '55',
          display: 'grid',
          placeItems: 'center',
          fontSize: '1.5rem',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 800, fontSize: '1rem' }}>{title}</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{hint}</span>
      </span>
      <span aria-hidden style={{ fontSize: '1.4rem', color: 'var(--dim)' }}>
        ›
      </span>
    </>
  );
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    minHeight: 72,
    padding: '0 10px',
    borderRadius: 18,
    background: 'var(--bg-primary)',
    border: 'none',
    color: 'var(--text-primary)',
    textAlign: 'left',
    textDecoration: 'none',
    fontFamily: 'inherit',
  };
  return href ? (
    <a
      href={href}
      style={style}
      {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}
    >
      {content}
    </a>
  ) : (
    <button onClick={onClick} style={style}>
      {content}
    </button>
  );
}
