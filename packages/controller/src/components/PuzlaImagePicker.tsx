import { useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { uploadPuzlaImage } from '../utils/puzlaImage';
import { useT } from '../i18n/useT';

/**
 * Puzla game-select: pick a picture, see it, replace it. The upload happens
 * right here (not on Start) so a slow phone photo can't stall the start, and
 * the result is keyed to the room — a picture uploaded for another room is
 * treated as none. Identical in the host package.
 */
export function PuzlaImagePicker({ roomCode }: { roomCode: string | null }) {
  const t = useT();
  const image = useGameStore((s) => s.puzlaImage);
  const setImage = useGameStore((s) => s.setPuzlaImage);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = image && image.roomCode === roomCode ? image : null;

  const onFile = async (file: File | undefined) => {
    if (!file || !roomCode) return;
    setBusy(true);
    setError(null);
    const res = await uploadPuzlaImage(file);
    setBusy(false);
    if (res.ok) {
      setImage({
        roomCode,
        imageId: res.imageId,
        url: res.url,
        width: res.width,
        height: res.height,
      });
    } else {
      setError(res.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        {t('puzla.config.image')}
      </span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.7rem',
          minHeight: current ? '9rem' : '4.2rem',
          padding: '0.5rem',
          borderRadius: '14px',
          border: `2px dashed ${current ? 'var(--accent)' : 'var(--line2)'}`,
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          fontSize: '0.95rem',
          fontWeight: 800,
          cursor: busy ? 'wait' : 'pointer',
          overflow: 'hidden',
        }}
      >
        {current ? (
          <>
            <img
              src={current.url}
              alt=""
              style={{ maxHeight: '8rem', maxWidth: '60%', borderRadius: '10px', objectFit: 'contain' }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>
              {busy ? t('puzla.config.uploading') : `🔄 ${t('puzla.config.changeImage')}`}
            </span>
          </>
        ) : (
          <span>{busy ? t('puzla.config.uploading') : `🖼️ ${t('puzla.config.pickImage')}`}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          // Allow picking the same file again after an error.
          e.target.value = '';
        }}
      />
      {error && (
        <span style={{ fontSize: '0.8rem', color: 'var(--danger)', textAlign: 'center' }}>{error}</span>
      )}
    </div>
  );
}
