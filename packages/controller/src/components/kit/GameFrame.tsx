import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { GAME_DEFINITIONS } from '@igra/shared';
import { useT } from '../../i18n/useT';
import { ACCENT_HEX } from '../../utils/gameAccent';
import { PlayerMenu } from '../PlayerMenu';
import { cue } from '../../utils/cues';
import { useGameStore } from '../../store/gameStore';
import { RoundCard } from './RoundCard';
import { TutorialBadge } from './Tutorial';

// How many GameFrames are mounted. GameScreen hides its floating player-menu
// circle while one is, because the frame's header carries the menu instead —
// the floating circle used to sit on top of the bottom-right answer.
const useGameFrameStore = create<{ mounted: number; bump: (d: number) => void }>(
  (set) => ({
    mounted: 0,
    bump: (d) => set((s) => ({ mounted: s.mounted + d })),
  })
);

/**
 * For a full-bleed screen that carries its own PlayerMenu instead of the
 * GameFrame header (Splav's joystick): hides the floating circle the same way.
 */
export function useHideFloatingMenu(): void {
  const bump = useGameFrameStore((s) => s.bump);
  useEffect(() => {
    bump(1);
    return () => bump(-1);
  }, [bump]);
}

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
  /** Changes once per new question / round — fires the "new round" cue. */
  roundKey?: string | number;
  /** Clock turns rust from this many seconds (default 5; the tick stays at 5). */
  urgentAt?: number;
  /**
   * Games with real rounds: a gold "Runda 3 od 5" card flashes for 1.2 s
   * whenever `round` goes up (Tok igre 2b).
   */
  roundCard?: { round: number; total: number; note?: string };
  children: ReactNode;
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Shared in-game shell (Kontroler kit): one header with game, progress, time
 * and player menu at the top, then the play area — nothing floats over it.
 */
export function GameFrame({
  gameId,
  subtitle,
  timeRemaining,
  timeTotal,
  roundKey,
  urgentAt = 5,
  roundCard,
  children,
}: GameFrameProps) {
  const t = useT();
  const bump = useGameFrameStore((s) => s.bump);
  useEffect(() => {
    bump(1);
    return () => bump(-1);
  }, [bump]);

  // Every phase enters the same way (Tok igre 2a): the play area rises 24px
  // with a fade on a springy curve — never a sideways slide, which reads as
  // "back". Web Animations on the existing node, not a keyed remount, so a
  // phase's local state survives and taps land from the first frame. `top`
  // rather than transform: a transform would re-anchor the games'
  // position:fixed backdrops to this box mid-animation.
  const phase = useGameStore((s) => s.gameState?.phase);
  // Proba: the clock stands still, so its slot shows "🎓 PROBA" + steps.
  const tutorial = useGameStore((s) => s.gameState?.data.tutorialMode === true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const seenPhase = useRef(phase);
  useLayoutEffect(() => {
    if (seenPhase.current === phase) return;
    seenPhase.current = phase;
    const el = bodyRef.current;
    if (!el?.animate) return;
    if (reducedMotion()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease' });
    } else {
      el.animate(
        [
          { opacity: 0, top: '24px' },
          { opacity: 1, top: '0px' },
        ],
        { duration: 220, easing: 'cubic-bezier(.34,1.56,.64,1)' }
      );
    }
  }, [phase]);

  const def = GAME_DEFINITIONS[gameId];
  const hex = def ? ACCENT_HEX[def.accent] : ACCENT_HEX.gold;
  const timed = timeRemaining !== undefined;
  const secs = timed ? Math.max(0, Math.ceil(timeRemaining)) : 0;
  const urgent = timed && secs <= urgentAt;
  useEffect(() => {
    if (roundKey !== undefined) cue('round');
  }, [roundKey]);

  // Last seconds (4d): one short tick per second, felt more than heard.
  const tickSec = timed && secs <= 5 && secs > 0 ? secs : null;
  useEffect(() => {
    if (tickSec !== null) cue('tick');
  }, [tickSec]);
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
                key={tickSec ?? 'calm'}
                className="display"
                style={{
                  display: 'inline-block',
                  animation: tickSec !== null ? 'igra-tick .15s ease-out' : undefined,
                  fontWeight: 700,
                  fontSize: '1.4rem',
                  lineHeight: 1,
                  minWidth: '2ch',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: urgent ? 'var(--danger)' : 'var(--text-primary)',
                }}
              >
                {secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : secs}
              </span>
              {secs < 60 && (
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
              )}
            </span>
          )}
          {tutorial && !timed && phase && <TutorialBadge gameId={gameId} phase={phase} />}
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
        ref={bodyRef}
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
      {roundCard && (
        <RoundCard
          gameId={gameId}
          round={roundCard.round}
          total={roundCard.total}
          note={roundCard.note}
        />
      )}
    </div>
  );
}
