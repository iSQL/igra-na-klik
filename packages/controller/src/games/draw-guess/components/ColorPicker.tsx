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

export function ColorPicker({ selectedColor, onSelect }: ColorPickerProps) {
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
          aria-label={`Boja ${color}`}
          style={{
            width: '30px',
            height: '30px',
            minHeight: '30px',
            minWidth: '30px',
            borderRadius: '50%',
            background: color,
            border:
              selectedColor === color
                ? '3px solid var(--accent)'
                : '2px solid var(--text-secondary)',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}
