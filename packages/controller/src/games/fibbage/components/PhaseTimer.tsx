interface PhaseTimerProps {
  /** Seconds left in the running phase (from the server's game state). */
  timeRemaining: number;
  /** Full phase length, for the drain bar. */
  duration: number;
  /** Short label to the left of the count, e.g. "3/6 poslalo". */
  label?: string;
}

/**
 * Countdown strip for the phone. The TV has a clock, but the phone is where
 * the player is actually typing or tapping — and in a hostless room there is
 * no TV at all, so without this nobody knows how long they have.
 */
export function PhaseTimer({ timeRemaining, duration, label }: PhaseTimerProps) {
  const secs = Math.max(0, Math.ceil(timeRemaining));
  const pct = duration > 0 ? Math.max(0, Math.min(1, timeRemaining / duration)) : 0;
  const urgent = secs <= 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          fontWeight: 800,
          color: 'var(--text-secondary)',
        }}
      >
        <span>{label ?? ''}</span>
        <span
          className="display"
          style={{
            fontSize: '1.05rem',
            color: urgent ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {secs}s
        </span>
      </div>
      <div
        style={{
          height: '5px',
          borderRadius: '999px',
          background: 'var(--bg-secondary)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct * 100}%`,
            height: '100%',
            borderRadius: '999px',
            background: urgent ? 'var(--danger)' : 'var(--cyan)',
            transition: 'width 1s linear, background .3s',
          }}
        />
      </div>
    </div>
  );
}
