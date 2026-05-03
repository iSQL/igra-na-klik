import { useRef, useState } from 'react';
import { socket } from '../../socket';
import { downscaleImage } from '../geo-pogodi/photo-utils';

const MAX_CAPTION_LENGTH = 80;
const MIN_CAPTION_LENGTH = 2;

interface FotoKvizPhotoSubmitterProps {
  photosNeeded: number;
  photosSubmitted: number;
}

type StepKind = 'pick' | 'caption';

/**
 * Slimmer than geo-pogodi's PhotoSubmitter — no map, no EXIF GPS. Just file
 * pick → required caption → submit. The caption is the correct answer text
 * for that photo when it appears as a question in the game.
 */
export function FotoKvizPhotoSubmitter({
  photosNeeded,
  photosSubmitted,
}: FotoKvizPhotoSubmitterProps) {
  const [step, setStep] = useState<StepKind>('pick');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
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
      const result = await downscaleImage(file);
      if (!result) {
        setError('Ne mogu da pročitam sliku.');
        return;
      }
      if (result.bytes > 700_000) {
        setError('Slika je prevelika i nakon kompresije. Probaj manju fotografiju.');
        return;
      }
      setImageBase64(result.base64);
      setStep('caption');
    } catch (err) {
      setError('Greška pri obradi slike.');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = () => {
    if (!imageBase64 || busy) return;
    const trimmed = caption.trim();
    if (trimmed.length < MIN_CAPTION_LENGTH) {
      setError(`Opis mora imati najmanje ${MIN_CAPTION_LENGTH} znaka.`);
      return;
    }
    setBusy(true);
    socket.emit('game:player-action', {
      action: 'foto:add-photo',
      data: { imageBase64, caption: trimmed },
    });
    // Reset for next photo. Server bumps photosSubmitted via state.
    setImageBase64(null);
    setCaption('');
    setStep('pick');
    setError(null);
    setBusy(false);
  };

  const handleBack = () => {
    setImageBase64(null);
    setCaption('');
    setStep('pick');
    setError(null);
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
        {step === 'caption' && (
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
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.95rem',
              color: 'var(--text-secondary)',
            }}
          >
            Izaberi fotografiju i napiši kratak opis lokacije —
            on će biti tačan odgovor u kvizu.
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

      {step === 'caption' && imageBase64 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
          <img
            src={imageBase64}
            alt=""
            style={{
              width: '100%',
              maxHeight: '38vh',
              objectFit: 'contain',
              borderRadius: '8px',
              background: '#000',
            }}
          />
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Opis lokacije (npr. "Kuća moje bake", "Kalemegdan", "Igralište u kraju")
          </p>
          <input
            autoFocus
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value.slice(0, MAX_CAPTION_LENGTH));
              setError(null);
            }}
            maxLength={MAX_CAPTION_LENGTH}
            placeholder="Tačan odgovor..."
            style={{
              padding: '0.85rem',
              fontSize: '1.05rem',
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
            disabled={busy || caption.trim().length < MIN_CAPTION_LENGTH}
            style={{
              padding: '0.95rem 1rem',
              fontSize: '1.05rem',
              fontWeight: 700,
              borderRadius: '12px',
              background:
                caption.trim().length >= MIN_CAPTION_LENGTH
                  ? 'var(--accent)'
                  : 'var(--bg-card)',
              color:
                caption.trim().length >= MIN_CAPTION_LENGTH
                  ? '#fff'
                  : 'var(--text-secondary)',
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
        <p
          style={{
            fontSize: '0.85rem',
            color: '#e74c3c',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
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
