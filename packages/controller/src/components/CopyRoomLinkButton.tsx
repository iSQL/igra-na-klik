import { useState } from 'react';
import { useT } from '../i18n/useT';

// Copies the join link (origin + /play/?code=XX) so the room creator can
// paste it to friends. navigator.clipboard is unavailable on plain-http
// LAN origins (not a secure context), so fall back to the legacy
// textarea + execCommand path there.
export function CopyRoomLinkButton({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = `${window.location.origin}/play/?code=${code}`;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      // fall through to the legacy path
    }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={copy}
      style={{
        padding: '0.45rem 0.9rem',
        fontSize: '0.8rem',
        fontWeight: 800,
        borderRadius: '10px',
        background: 'rgba(255,255,255,.14)',
        color: copied ? 'var(--success)' : '#fff',
        border: `1px solid ${copied ? 'var(--success)' : 'rgba(255,255,255,.35)'}`,
        cursor: 'pointer',
        minHeight: '40px',
      }}
    >
      {copied ? t('room.copied') : t('room.copyLink')}
    </button>
  );
}
