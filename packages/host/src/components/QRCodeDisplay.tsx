import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  roomCode: string;
}

const CONTROLLER_URL =
  import.meta.env.VITE_CONTROLLER_URL || 'http://localhost:5174';

export function QRCodeDisplay({ roomCode }: QRCodeDisplayProps) {
  const joinUrl = `${CONTROLLER_URL}?code=${roomCode}`;

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
        Scan or visit: {CONTROLLER_URL}
      </p>
    </div>
  );
}
