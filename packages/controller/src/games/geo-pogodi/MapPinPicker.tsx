import { useEffect, useState } from 'react';
import type { GeoPin } from '@igra/shared';
import { socket } from '../../socket';
import { SerbiaMap } from './components/SerbiaMap';

interface MapPinPickerProps {
  timeRemaining: number;
  hasLocked: boolean;
  ownPin?: GeoPin;
  ownColor?: string;
  /**
   * Hostless rooms: the round photo, shown as a header thumbnail that
   * expands full-screen on tap (there is no TV keeping it visible).
   */
  photoUrl?: string;
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
  photoUrl,
}: MapPinPickerProps) {
  const [draftPin, setDraftPin] = useState<GeoPin | null>(ownPin ?? null);
  const [photoOpen, setPhotoOpen] = useState(false);

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

  const photoThumb = photoUrl ? (
    <button
      onClick={() => setPhotoOpen(true)}
      aria-label="Prikaži sliku"
      style={{
        padding: 0,
        border: '2px solid var(--accent)',
        borderRadius: '8px',
        overflow: 'hidden',
        background: '#000',
        width: '64px',
        height: '44px',
        flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      <img
        src={photoUrl}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </button>
  ) : null;

  const photoOverlay =
    photoUrl && photoOpen ? (
      <div
        onClick={() => setPhotoOpen(false)}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
          gap: '0.75rem',
        }}
      >
        <img
          src={photoUrl}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '85dvh', objectFit: 'contain' }}
        />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
          Tapni bilo gde da zatvoriš
        </p>
      </div>
    ) : null;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {photoThumb}
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
        {photoOverlay}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {photoThumb}
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
      {photoOverlay}
    </div>
  );
}
