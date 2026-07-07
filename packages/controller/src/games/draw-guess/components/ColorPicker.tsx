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

import { useT } from '../../../i18n/useT';

interface ColorPickerProps {
  selectedColor: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({ selectedColor, onSelect }: ColorPickerProps) {
  const t = useT();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.35rem',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {COLORS.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          aria-label={t('common.colorAria', { color })}
          style={{
            width: '30px',
            height: '30px',
            minHeight: '30px',
            minWidth: '30px',
            borderRadius: '50%',
            background: color,
            border: 'none',
            boxShadow:
              selectedColor === color
                ? '0 0 0 2px #fff, 0 0 0 4px var(--pink)'
                : '0 0 0 1px var(--line2)',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}
