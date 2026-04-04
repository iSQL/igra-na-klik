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
    // Derive from current host — same hostname, controller port
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:5174`;
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
        Scan or visit: {controllerBase}
      </p>
    </div>
  );
}
