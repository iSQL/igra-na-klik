const COLORS = ['#000000', '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ffffff'];

interface ColorPickerProps {
  selectedColor: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({ selectedColor, onSelect }: ColorPickerProps) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
      {COLORS.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          style={{
            width: '32px',
            height: '32px',
            minHeight: '32px',
            minWidth: '32px',
            borderRadius: '50%',
            background: color,
            border: selectedColor === color ? '3px solid var(--accent)' : '2px solid var(--text-secondary)',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}
