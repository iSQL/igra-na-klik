import { useEffect, useState } from 'react';
import type { GeoPin } from '@igra/shared';
import { socket } from '../../socket';
import { SerbiaMap } from './components/SerbiaMap';

interface MapPinPickerProps {
  timeRemaining: number;
  hasLocked: boolean;
  ownPin?: GeoPin;
  ownColor?: string;
}

// Vertical chrome around the map: header (~30px) + button (~60px) + outer
// vertical padding (~32px) + gap (~24px) ≈ 150px. Leaving 30px slack.
const MAP_MAX_HEIGHT_CSS = 'calc(100dvh - 180px)';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  // Vertical padding only — the map runs edge-to-edge horizontally so it
  // gets every pixel the viewport has to offer. Header + button apply their
  // own horizontal padding below.
  padding: '1rem 0',
  gap: '0.75rem',
};

const rowPad: React.CSSProperties = { padding: '0 1rem' };

export function MapPinPicker({
  timeRemaining,
  hasLocked,
  ownPin,
  ownColor,
}: MapPinPickerProps) {
  const [draftPin, setDraftPin] = useState<GeoPin | null>(ownPin ?? null);

  // Sync the draft pin with the server's authoritative ownPin (e.g. on
  // reconnect during placing).
  useEffect(() => {
    if (ownPin) setDraftPin(ownPin);
  }, [ownPin]);

  const handleLock = () => {
    if (!draftPin || hasLocked) return;
    socket.emit('game:player-action', {
      action: 'geo:place-pin',
      data: { pin: draftPin },
    });
  };

  const lowTime = timeRemaining <= 5;

  if (hasLocked) {
    return (
      <div style={containerStyle}>
        <div
          style={{
            ...rowPad,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <p style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: '#7be37b' }}>
            ✓ Pin zaključan
          </p>
          <span
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: lowTime ? 'var(--danger)' : 'var(--text-primary)',
            }}
          >
            {timeRemaining}s
          </span>
        </div>
        <SerbiaMap
          pin={draftPin ?? undefined}
          disabled
          pinColor={ownColor}
          maxHeightCss={MAP_MAX_HEIGHT_CSS}
        />
        <p
          style={{
            ...rowPad,
            textAlign: 'center',
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          Čekamo ostale...
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div
        style={{
          ...rowPad,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
          Tapni gde je slikana
        </p>
        <span
          style={{
            fontSize: lowTime ? '1.4rem' : '1.05rem',
            fontWeight: 700,
            color: lowTime ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {timeRemaining}s
        </span>
      </div>
      <SerbiaMap
        pin={draftPin ?? undefined}
        onPinChange={setDraftPin}
        pinColor={ownColor}
        maxHeightCss={MAP_MAX_HEIGHT_CSS}
      />
      <div style={rowPad}>
        <button
          onClick={handleLock}
          disabled={!draftPin}
          style={{
            width: '100%',
            padding: '0.9rem 1rem',
            fontSize: '1.05rem',
            fontWeight: 700,
            borderRadius: '12px',
            background: draftPin ? 'var(--accent)' : 'var(--bg-card)',
            color: draftPin ? '#fff' : 'var(--text-secondary)',
            border: 'none',
          }}
        >
          Potvrdi pin
        </button>
      </div>
    </div>
  );
}
