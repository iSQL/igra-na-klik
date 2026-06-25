import { useT } from '../../../i18n/useT';

const SIZES = [1, 3, 5, 15];

interface BrushSizePickerProps {
  width: number;
  onChange: (width: number) => void;
}

export function BrushSizePicker({ width, onChange }: BrushSizePickerProps) {
  const t = useT();
  return (
    <div style={{ display: 'flex', gap: '0.3rem' }}>
      {SIZES.map((s) => {
        const active = width === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            aria-label={t('drawGuess.thickness', { n: s })}
            title={t('drawGuess.thickness', { n: s })}
            style={{
              width: '36px',
              height: '36px',
              minWidth: '36px',
              minHeight: '36px',
              borderRadius: '8px',
              background: active ? 'var(--accent)' : 'var(--bg-secondary)',
              border: active
                ? '2px solid var(--accent)'
                : '2px solid var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <div
              style={{
                width: `${Math.min(s + 3, 22)}px`,
                height: `${Math.min(s + 3, 22)}px`,
                borderRadius: '50%',
                background: active ? '#fff' : 'var(--text-primary)',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
