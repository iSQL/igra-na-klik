import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { GAME_DEFINITIONS } from '@igra/shared';
import { useT } from '../../i18n/useT';
import { ACCENT_HEX } from '../../utils/gameAccent';
import { PlayerMenu } from '../PlayerMenu';

// How many GameFrames are mounted. GameScreen hides its floating player-menu
// circle while one is, because the frame's header carries the menu instead —
// the floating circle used to sit on top of the bottom-right answer.
const useGameFrameStore = create<{ mounted: number; bump: (d: number) => void }>(
  (set) => ({
    mounted: 0,
    bump: (d) => set((s) => ({ mounted: s.mounted + d })),
  })
);

export function useGameFrameMounted(): boolean {
  return useGameFrameStore((s) => s.mounted > 0);
}

interface GameFrameProps {
  gameId: string;
  /** Second header line, e.g. "Pitanje 3/10 · Istorija Srbije". */
  subtitle?: string;
  /** Seconds left in a timed phase. Omit when the phase isn't timed. */
  timeRemaining?: number;
  /** Full phase length — draws the drain bar under the header. */
  timeTotal?: number;
  children: ReactNode;
}

/**
 * Shared in-game shell (Kontroler kit): one header with game, progress, time
 * and player menu at the top, then the play area — nothing floats over it.
 */
export function GameFrame({
  gameId,
  subtitle,
  timeRemaining,
  timeTotal,
  children,
}: GameFrameProps) {
  const t = useT();
  const bump = useGameFrameStore((s) => s.bump);
  useEffect(() => {
    bump(1);
    return () => bump(-1);
  }, [bump]);

  const def = GAME_DEFINITIONS[gameId];
  const hex = def ? ACCENT_HEX[def.accent] : ACCENT_HEX.gold;
  const timed = timeRemaining !== undefined;
  const secs = timed ? Math.max(0, Math.ceil(timeRemaining)) : 0;
  const urgent = timed && secs <= 5;
  const frac =
    timed && timeTotal && timeTotal > 0
      ? Math.max(0, Math.min(1, timeRemaining / timeTotal))
      : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          // #root already pads 1rem + safe areas on every side.
          padding: '0.25rem 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: hex + '2b',
              border: '1px solid ' + hex + '55',
              display: 'grid',
              placeItems: 'center',
              fontSize: '1.2rem',
              flexShrink: 0,
            }}
          >
            {def?.icon}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span
              className="display"
              style={{ fontWeight: 700, fontSize: '1.12rem', lineHeight: 1.1 }}
            >
              {t(`game.${gameId}.name`)}
            </span>
            {subtitle && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {subtitle}
              </span>
            )}
          </span>
          {timed && (
            <span
              role="timer"
              aria-label={`${secs} s`}
              style={{
                height: 40,
                padding: '0 12px',
                borderRadius: 12,
                background: urgent ? 'rgba(224,106,94,.18)' : 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexShrink: 0,
              }}
            >
              <span
                className="display"
                style={{
                  fontWeight: 700,
                  fontSize: '1.4rem',
                  lineHeight: 1,
                  minWidth: '2ch',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: urgent ? 'var(--danger)' : 'var(--text-primary)',
                }}
              >
                {secs}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--text-secondary)',
                  alignSelf: 'flex-end',
                  paddingBottom: 9,
                }}
              >
                s
              </span>
            </span>
          )}
          <PlayerMenu inGame variant="header" />
        </div>
        {frac !== null && (
          <div
            style={{
              marginTop: 12,
              height: 6,
              borderRadius: 999,
              background: 'var(--bg-card)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${frac * 100}%`,
                height: '100%',
                borderRadius: 999,
                background: urgent ? 'var(--danger)' : 'var(--accent)',
                transition: 'width 1s linear, background .3s',
              }}
            />
          </div>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {children}
      </div>
    </div>
  );
}
