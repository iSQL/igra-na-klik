import { useT } from '../../../i18n/useT';

export type DrawTool = 'pencil' | 'fill';

const TOOL_KEYS: Record<DrawTool, string> = {
  pencil: 'drawGuess.pencil',
  fill: 'drawGuess.fill',
};

interface ToolButtonProps {
  tool: DrawTool;
  active: boolean;
  onSelect: (tool: DrawTool) => void;
}

export function ToolButton({ tool, active, onSelect }: ToolButtonProps) {
  const t = useT();
  const label = t(TOOL_KEYS[tool]);
  return (
    <button
      onClick={() => onSelect(tool)}
      aria-label={label}
      title={label}
      style={{
        minWidth: '60px',
        height: '36px',
        padding: '0 0.6rem',
        borderRadius: '8px',
        border: active
          ? '2px solid var(--accent)'
          : '2px solid var(--text-secondary)',
        background: active ? 'var(--accent)' : 'var(--bg-secondary)',
        color: active ? '#fff' : 'var(--text-primary)',
        fontWeight: 600,
        fontSize: '0.85rem',
      }}
    >
      {label}
    </button>
  );
}
