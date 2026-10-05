import { useT } from '../../../i18n/useT';

const SIZES = [2, 6, 15];

interface BrushSizePickerProps {
  width: number;
  onChange: (width: number) => void;
  /** False while the fill tool is on — no size is "in use" then. */
  active?: boolean;
}

/** Three wide brush sizes — the second thumb row under the canvas. */
export function BrushSizePicker({ width, onChange, active = true }: BrushSizePickerProps) {
  const t = useT();
  return (
    <>
      {SIZES.map((s) => {
        const on = active && width === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            aria-label={t('drawGuess.thickness', { n: s })}
            title={t('drawGuess.thickness', { n: s })}
            style={{
              height: 44,
              minHeight: 44,
              padding: 0,
              borderRadius: 12,
              background: on ? 'rgba(245,235,224,.16)' : 'rgba(245,235,224,.08)',
              border: on ? '1.5px solid var(--accent)' : '1.5px solid transparent',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <span
              style={{
                width: Math.min(s + 4, 20),
                height: Math.min(s + 4, 20),
                borderRadius: '50%',
                background: 'var(--text-primary)',
              }}
            />
          </button>
        );
      })}
    </>
  );
}
