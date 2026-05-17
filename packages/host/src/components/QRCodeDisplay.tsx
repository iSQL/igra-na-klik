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
    const { protocol, hostname, port, origin } = window.location;

    // Vite dev bundle: host + controller are spun up together with
    // sequential port allocation. By convention the controller is
    // host_port + 1 — works for the default 5173→5174 pair, or for
    // 5175→5176 when another project grabbed the defaults first.
    if (import.meta.env.DEV && port) {
      const next = parseInt(port, 10);
      if (Number.isFinite(next)) {
        return `${protocol}//${hostname}:${next + 1}`;
      }
    }

    // Local-dev gotcha: a previous `npm run build` leaves a static host
    // bundle that the express server keeps serving on :3001 even when
    // Vite is also running. On a local hostname the Vite dev controller
    // is overwhelmingly more likely to be the intended target — real
    // single-container deploys terminate on a domain (not localhost)
    // and keep using /play below.
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:5174`;
    }

    // Production single-container deploy: controller served at /play.
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
