import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useT } from '../i18n/useT';

interface QRCodeDisplayProps {
  roomCode: string;
}

export function QRCodeDisplay({ roomCode }: QRCodeDisplayProps) {
  const t = useT();
  const joinUrl = useMemo(() => {
    if (import.meta.env.VITE_CONTROLLER_URL) {
      return import.meta.env.VITE_CONTROLLER_URL as string;
    }
    const { protocol, hostname, origin } = window.location;

    // Vite dev: controller lives on its own port (5174). Use the same
    // hostname the host was loaded from so LAN phones hitting the host
    // on 192.168.x.y:5173 are sent to 192.168.x.y:5174, not localhost.
    if (import.meta.env.DEV) {
      return `${protocol}//${hostname}:5174`;
    }

    // Production single-container deploy: controller served at /play.
    return `${origin}/play`;
  }, []);

  return (
    <div style={{ textAlign: 'center' }}>
      <QRCodeSVG
        value={joinUrl}
        size={200}
        bgColor="#1a1a2e"
        fgColor="#e0e0e0"
        level="M"
      />
      <p
        style={{
          marginTop: '0.5rem',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
        }}
      >
        {joinUrl}
      </p>
      <p
        style={{
          marginTop: '0.25rem',
          fontSize: '1rem',
          color: 'var(--text-secondary)',
        }}
      >
        {t('join.codeLabel')}: <strong style={{ color: 'var(--accent)', fontFamily: 'monospace', letterSpacing: '0.15rem' }}>{roomCode}</strong>
      </p>
    </div>
  );
}
