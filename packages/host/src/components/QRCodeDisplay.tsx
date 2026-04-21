import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  roomCode: string;
}

export function QRCodeDisplay({ roomCode }: QRCodeDisplayProps) {
  const controllerBase = useMemo(() => {
    if (import.meta.env.VITE_CONTROLLER_URL) {
      return import.meta.env.VITE_CONTROLLER_URL as string;
    }
    // Dev: host runs on :5173, controller on :5174, same hostname.
    // Prod (single-container deploy): controller is served at /play on the same origin.
    const { protocol, hostname, port, origin } = window.location;
    if (port === '5173') {
      return `${protocol}//${hostname}:5174`;
    }
    return `${origin}/play`;
  }, []);

  const joinUrl = `${controllerBase}?code=${roomCode}`;

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
        kod: <strong style={{ color: 'var(--accent)', fontFamily: 'monospace', letterSpacing: '0.15rem' }}>{roomCode}</strong>
      </p>
    </div>
  );
}
