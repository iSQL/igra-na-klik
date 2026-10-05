import { useT } from '../i18n/useT';
import { previewSound, useCueSettings, vibrate } from '../utils/cues';

/**
 * Vibration / sound switches (redizajn 4i) — per device, in the start ⋯ menu
 * and the player menu. Turning one on plays a sample so the player feels or
 * hears what they enabled (and iOS unlocks audio on that tap).
 */
export function CueToggles({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { vibration, sound, setVibration, setSound } = useCueSettings();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 4 : 0,
        padding: compact ? '0 0.15rem' : '0 10px',
      }}
    >
      <Switch
        label={t('cues.vibration')}
        on={vibration}
        compact={compact}
        onChange={(on) => {
          setVibration(on);
          if (on) vibrate(30);
        }}
      />
      <Switch
        label={t('cues.sound')}
        on={sound}
        compact={compact}
        onChange={(on) => {
          setSound(on);
          if (on) previewSound();
        }}
      />
    </div>
  );
}

function Switch({
  label,
  on,
  compact,
  onChange,
}: {
  label: string;
  on: boolean;
  compact: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: compact ? 40 : 56,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          flex: 1,
          fontWeight: compact ? 700 : 800,
          fontSize: compact ? '0.9rem' : '1rem',
          color: compact ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}
      >
        {label}
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        style={{
          position: 'relative',
          width: 50,
          height: 30,
          minWidth: 50,
          minHeight: 30,
          padding: 0,
          borderRadius: 999,
          border: 'none',
          background: on ? 'var(--accent)' : 'var(--bg-card)',
          transition: 'background .2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: on ? 23 : 3,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--text-primary)',
            boxShadow: '0 1px 4px rgba(0,0,0,.3)',
            transition: 'left .2s cubic-bezier(.34,1.56,.64,1)',
          }}
        />
      </button>
    </label>
  );
}
