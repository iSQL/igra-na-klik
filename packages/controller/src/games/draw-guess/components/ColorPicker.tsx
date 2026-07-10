import { useState, useRef, useEffect } from 'react';
import { useT } from '../../../i18n/useT';

const COLORS = [
  '#000000',
  '#ffffff',
  '#7f8c8d',
  '#c0392b',
  '#e74c3c',
  '#f39c12',
  '#f1c40f',
  '#27ae60',
  '#2ecc71',
  '#2980b9',
  '#3498db',
  '#8e44ad',
  '#ff6fb1',
];

interface ColorPickerProps {
  selectedColor: string;
  onSelect: (color: string) => void;
}

/**
 * Collapsed colour picker: a single swatch button that opens a popup grid of
 * the curated palette plus a "+" that hands off to the OS colour picker for any
 * custom shade. Keeps the drawing toolbar to one row instead of spilling 13
 * swatches across the screen.
 */
export function ColorPicker({ selectedColor, onSelect }: ColorPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const isCustom = !COLORS.includes(selectedColor.toLowerCase());

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('drawGuess.pickColor')}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          height: '40px',
          minWidth: '44px',
          padding: '0 0.55rem',
          borderRadius: '12px',
          border: '1px solid var(--line2)',
          background: 'var(--bg-secondary)',
        }}
      >
        <span
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: selectedColor,
            boxShadow: '0 0 0 1px var(--line2)',
          }}
        />
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 34px)',
            gap: '0.4rem',
            padding: '0.6rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--line2)',
            borderRadius: '14px',
            boxShadow: '0 10px 30px rgba(0,0,0,.35)',
            zIndex: 30,
          }}
        >
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onSelect(color);
                setOpen(false);
              }}
              aria-label={t('common.colorAria', { color })}
              style={{
                width: '34px',
                height: '34px',
                minWidth: '34px',
                minHeight: '34px',
                borderRadius: '50%',
                background: color,
                border: 'none',
                padding: 0,
                boxShadow:
                  selectedColor.toLowerCase() === color
                    ? '0 0 0 2px var(--bg-card), 0 0 0 4px var(--pink)'
                    : '0 0 0 1px var(--line2)',
              }}
            />
          ))}

          {/* Custom shade via the OS colour picker. */}
          <label
            aria-label={t('drawGuess.customColor')}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '1.2rem',
              fontWeight: 800,
              background:
                'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
              boxShadow: isCustom
                ? '0 0 0 2px var(--bg-card), 0 0 0 4px var(--pink)'
                : '0 0 0 1px var(--line2)',
            }}
          >
            <span
              style={{
                textShadow: '0 0 3px rgba(0,0,0,.7)',
                pointerEvents: 'none',
              }}
            >
              +
            </span>
            <input
              type="color"
              value={isCustom ? selectedColor : '#000000'}
              onChange={(e) => onSelect(e.target.value)}
              style={{
                position: 'absolute',
                width: 0,
                height: 0,
                opacity: 0,
                pointerEvents: 'none',
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
