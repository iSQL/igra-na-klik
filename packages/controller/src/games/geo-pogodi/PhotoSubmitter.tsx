import { useRef, useState } from 'react';
import type { GeoPin } from '@igra/shared';
import { socket } from '../../socket';
import { SerbiaMap } from './components/SerbiaMap';
import { downscaleImage, extractGpsPin } from './photo-utils';
import type { GpsExtractionResult } from './photo-utils';

const MAX_CAPTION_LENGTH = 80;

interface PhotoSubmitterProps {
  photosNeeded: number;
  photosSubmitted: number;
  ownColor?: string;
}

type StepKind = 'pick' | 'pin' | 'caption';

export function PhotoSubmitter({
  photosNeeded,
  photosSubmitted,
  ownColor,
}: PhotoSubmitterProps) {
  const [step, setStep] = useState<StepKind>('pick');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [pin, setPin] = useState<GeoPin | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsExtractionResult['kind'] | null>(
    null
  );
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allDone = photosSubmitted >= photosNeeded;

  if (allDone) {
    return (
      <Centered>
        <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>
          Sve slike poslate!
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Čekamo ostale igrače...
        </p>
      </Centered>
    );
  }

  const handlePickFile = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      // Run downscale and EXIF GPS extraction in parallel — both read the
      // original File so there's no contention.
      const [result, gps] = await Promise.all([
        downscaleImage(file),
        extractGpsPin(file),
      ]);
      if (!result) {
        setError('Ne mogu da pročitam sliku.');
        return;
      }
      if (result.bytes > 700_000) {
        setError('Slika je prevelika i nakon kompresije. Probaj manju fotografiju.');
        return;
      }
      setImageBase64(result.base64);
      setGpsStatus(gps.kind);
      setPin(gps.kind === 'found' ? gps.pin : null);
      setStep('pin');
    } catch (err) {
      setError('Greška pri obradi slike.');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmPin = () => {
    if (!pin) return;
    setStep('caption');
  };

  const handleSubmit = () => {
    if (!imageBase64 || !pin || busy) return;
    setBusy(true);
    socket.emit('game:player-action', {
      action: 'geo:add-photo',
      data: {
        imageBase64,
        pin,
        caption: caption.trim() || undefined,
      },
    });
    // Reset for next photo. The server will bump photosSubmitted via state.
    setImageBase64(null);
    setPin(null);
    setGpsStatus(null);
    setCaption('');
    setStep('pick');
    setBusy(false);
  };

  const handleBack = () => {
    if (step === 'pin') {
      setImageBase64(null);
      setPin(null);
      setGpsStatus(null);
      setStep('pick');
    } else if (step === 'caption') {
      setStep('pin');
    }
  };

  // Manual placement clears the EXIF-found status so the green confirmation
  // doesn't keep claiming the pin came from the photo after the player moves it.
  const handlePinChange = (next: GeoPin) => {
    setPin(next);
    if (gpsStatus === 'found') setGpsStatus(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '1rem',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
          Slika {photosSubmitted + 1} / {photosNeeded}
        </p>
        {step !== 'pick' && (
          <button
            onClick={handleBack}
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
              borderRadius: '0.5rem',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--text-secondary)',
            }}
          >
            ← Nazad
          </button>
        )}
      </div>

      {step === 'pick' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <p style={{ textAlign: 'center', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Izaberi fotografiju lokacije u Srbiji koju će ostali igrači
            pokušati da pogode.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <button
            onClick={handlePickFile}
            disabled={busy}
            style={{
              padding: '0.9rem 1.6rem',
              fontSize: '1.05rem',
              fontWeight: 700,
              borderRadius: '12px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Učitavanje...' : 'Izaberi sliku'}
          </button>
        </div>
      )}

      {step === 'pin' && imageBase64 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
          <img
            src={imageBase64}
            alt=""
            style={{
              width: '100%',
              maxHeight: '32vh',
              objectFit: 'contain',
              borderRadius: '8px',
              background: '#000',
            }}
          />
          <GpsFeedback status={gpsStatus} pinPlaced={pin !== null} />
          <SerbiaMap
            pin={pin ?? undefined}
            onPinChange={handlePinChange}
            pinColor={ownColor ?? '#ff3b3b'}
            maxHeightCss="38dvh"
          />
          <button
            onClick={handleConfirmPin}
            disabled={!pin}
            style={{
              padding: '0.85rem 1rem',
              fontSize: '1rem',
              fontWeight: 700,
              borderRadius: '12px',
              background: pin ? 'var(--accent)' : 'var(--bg-card)',
              color: pin ? '#fff' : 'var(--text-secondary)',
              border: 'none',
            }}
          >
            Potvrdi lokaciju
          </button>
        </div>
      )}

      {step === 'caption' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Opis (opciono) — prikazaće se nakon otkrivanja.
          </p>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION_LENGTH))}
            maxLength={MAX_CAPTION_LENGTH}
            placeholder="npr. Moja baka u Vranju"
            style={{
              padding: '0.75rem',
              fontSize: '1rem',
              borderRadius: '8px',
              border: '2px solid var(--bg-card)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          />
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              alignSelf: 'flex-end',
            }}
          >
            {caption.length} / {MAX_CAPTION_LENGTH}
          </span>
          <button
            onClick={handleSubmit}
            disabled={busy}
            style={{
              padding: '0.95rem 1rem',
              fontSize: '1.05rem',
              fontWeight: 700,
              borderRadius: '12px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              opacity: busy ? 0.6 : 1,
              marginTop: 'auto',
            }}
          >
            Pošalji sliku
          </button>
        </div>
      )}

      {error && (
        <p style={{ fontSize: '0.85rem', color: '#e74c3c', textAlign: 'center', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Renders a status pill above the map describing what happened with the
 * EXIF-based GPS lookup. Always shown so the player has explicit confirmation
 * the lookup ran (even when there's nothing to report).
 */
function GpsFeedback({
  status,
  pinPlaced,
}: {
  status: GpsExtractionResult['kind'] | null;
  pinPlaced: boolean;
}) {
  let bg = 'var(--bg-card)';
  let color = 'var(--text-secondary)';
  let icon = '';
  let text = 'Tapni mapu gde je slikana ova fotografija.';

  if (status === 'found') {
    bg = 'rgba(46, 204, 113, 0.18)';
    color = '#7be37b';
    icon = '✓';
    text = pinPlaced
      ? 'Lokacija učitana iz fotografije. Možeš je prepraviti tapom.'
      : 'Lokacija pročitana, ali nije postavljena. Tapni mapu.';
  } else if (status === 'no-gps') {
    bg = 'rgba(241, 196, 15, 0.18)';
    color = '#f1c40f';
    icon = '⚠';
    text = 'Slika nema GPS podatke — postavi pin ručno.';
  } else if (status === 'outside-serbia') {
    bg = 'rgba(241, 196, 15, 0.18)';
    color = '#f1c40f';
    icon = '⚠';
    text = 'GPS van Srbije — postavi pin ručno na mapi.';
  } else if (status === 'error') {
    bg = 'rgba(231, 76, 60, 0.18)';
    color = '#ff8585';
    icon = '⚠';
    text = 'Nisam mogao da pročitam GPS — postavi pin ručno.';
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.6rem 0.8rem',
        background: bg,
        color,
        fontSize: '0.9rem',
        borderRadius: '8px',
        fontWeight: 600,
        margin: 0,
      }}
    >
      {icon && <span style={{ fontSize: '1.1rem' }}>{icon}</span>}
      <span>{text}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '0.7rem',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}
