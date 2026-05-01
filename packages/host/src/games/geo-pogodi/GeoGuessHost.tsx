import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  GeoHostData,
  GeoLeaderboardEntry,
  GeoSubmissionProgress,
} from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { SerbiaMap } from './components/SerbiaMap';

export default function GeoGuessHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;

    if (phase !== prevPhaseRef.current) {
      if (phase === 'reveal') play('reveal');
      if (phase === 'final-leaderboard') play('victory');
      prevPhaseRef.current = phase;
    }

    if (phase === 'placing' || phase === 'submission') {
      const currSec = Math.ceil(timeRemaining);
      const prevSec = Math.ceil(prevTimeRef.current);
      if (currSec !== prevSec && currSec <= 5 && currSec > 0 && phase === 'placing') {
        play('tick');
      }
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as GeoHostData | undefined;
  if (!host) return null;

  if (phase === 'submission') {
    return (
      <SubmissionScreen
        progress={host.submissionProgress ?? []}
        photosPerPlayer={host.customPhotosPerPlayer ?? 0}
      />
    );
  }

  if (phase === 'intro') {
    return <IntroScreen packName={host.packName ?? '...'} totalRounds={host.totalRounds} />;
  }

  if (phase === 'viewing' && host.currentRound) {
    return (
      <ViewingScreen
        imageUrl={host.currentRound.location.imageUrl}
        roundNumber={host.currentRound.index + 1}
        totalRounds={host.currentRound.total}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'placing' && host.currentRound) {
    return (
      <PlacingScreen
        imageUrl={host.currentRound.location.imageUrl}
        roundNumber={host.currentRound.index + 1}
        totalRounds={host.currentRound.total}
        timeRemaining={timeRemaining}
        lockedCount={host.lockedCount ?? 0}
        totalGuessers={host.totalGuessers ?? 0}
      />
    );
  }

  if (phase === 'reveal' && host.currentRound) {
    return (
      <RevealScreen
        caption={host.currentRound.location.caption}
        revealPins={host.revealPins ?? []}
        truePin={host.truePinSvg}
      />
    );
  }

  if (phase === 'final-leaderboard') {
    return <FinalLeaderboard entries={host.finalLeaderboard ?? []} />;
  }

  if (phase === 'ended') {
    return <Centered>Hvala na igri!</Centered>;
  }

  return <Centered>Učitavanje...</Centered>;
}

// ============================================================================
// Sub-screens
// ============================================================================

function SubmissionScreen({
  progress,
  photosPerPlayer,
}: {
  progress: GeoSubmissionProgress[];
  photosPerPlayer: number;
}) {
  const allDone =
    progress.length > 0 && progress.every((p) => p.submitted >= p.total);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '2rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 0 }}>
        Slanje slika
      </h1>
      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        Svaki igrač šalje {photosPerPlayer} {photosPerPlayer === 1 ? 'sliku' : 'slike'} sa svog telefona
        i označi gde je slikana na mapi.
      </p>
      {allDone && (
        <p style={{ color: '#7be37b', fontSize: '1.2rem', fontWeight: 700 }}>
          Sve slike poslate — počinjemo!
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem',
          width: '100%',
        }}
      >
        {progress.map((p) => {
          const pct = p.total === 0 ? 0 : (p.submitted / p.total) * 100;
          const done = p.submitted >= p.total;
          return (
            <div
              key={p.playerId}
              style={{
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                padding: '0.9rem 1rem',
                borderLeft: `6px solid ${p.avatarColor}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <strong>{p.name}</strong>
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: done ? '#7be37b' : 'var(--text-secondary)',
                  }}
                >
                  {p.submitted}/{p.total}
                </span>
              </div>
              <div
                style={{
                  height: '6px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: done ? '#7be37b' : p.avatarColor,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IntroScreen({ packName, totalRounds }: { packName: string; totalRounds: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
      }}
    >
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{ fontSize: '3rem', textAlign: 'center' }}
      >
        Pogodi gde je
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{ fontSize: '1.4rem', color: 'var(--accent)' }}
      >
        {packName}
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}
      >
        {totalRounds} {totalRounds === 1 ? 'runda' : 'runde'}
      </motion.p>
    </div>
  );
}

function ViewingScreen({
  imageUrl,
  roundNumber,
  totalRounds,
  timeRemaining,
}: {
  imageUrl: string;
  roundNumber: number;
  totalRounds: number;
  timeRemaining: number;
}) {
  return (
    <PhotoFocusLayout
      header={
        <>
          <span>
            Runda {roundNumber} / {totalRounds}
          </span>
          <span>Pripremi se: {timeRemaining}s</span>
        </>
      }
      imageUrl={imageUrl}
    />
  );
}

function PlacingScreen({
  imageUrl,
  roundNumber,
  totalRounds,
  timeRemaining,
  lockedCount,
  totalGuessers,
}: {
  imageUrl: string;
  roundNumber: number;
  totalRounds: number;
  timeRemaining: number;
  lockedCount: number;
  totalGuessers: number;
}) {
  const lowTime = timeRemaining <= 5;
  return (
    <PhotoFocusLayout
      header={
        <>
          <span>
            Runda <strong>{roundNumber}</strong> / {totalRounds}
          </span>
          <span
            style={{
              fontWeight: 700,
              color: lowTime ? '#e74c3c' : 'var(--text-primary)',
              fontSize: lowTime ? '1.6rem' : '1.2rem',
            }}
          >
            {timeRemaining}s
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Zaključano: <strong>{lockedCount}</strong> / {totalGuessers}
          </span>
        </>
      }
      imageUrl={imageUrl}
      footer="Tapni mapu na svom telefonu da postaviš iglu."
    />
  );
}

function RevealScreen({
  caption,
  revealPins,
  truePin,
}: {
  caption?: string;
  revealPins: import('@igra/shared').GeoRevealPin[];
  truePin?: import('@igra/shared').GeoPin;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '1.5rem',
        width: '100%',
        height: '100%',
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          fontSize: '2rem',
          textAlign: 'center',
          margin: 0,
          color: 'var(--text-primary)',
        }}
      >
        {caption ?? 'Otkriva se...'}
      </motion.h2>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <SerbiaMap
          pins={revealPins}
          truePin={truePin}
          showLines
          maxHeightCss="calc(100dvh - 140px)"
          maxWidthCss="80vw"
        />
      </div>
    </div>
  );
}

function FinalLeaderboard({ entries }: { entries: GeoLeaderboardEntry[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.2rem',
        padding: '2rem',
      }}
    >
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ fontSize: '2.6rem' }}
      >
        Konačna tabela
      </motion.h1>
      <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <AnimatePresence>
          {entries.map((entry, i) => (
            <motion.div
              key={entry.playerId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.85rem 1.1rem',
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                borderLeft: `8px solid ${entry.avatarColor}`,
                fontSize: '1.2rem',
              }}
            >
              <span style={{ width: '2rem', textAlign: 'center', fontWeight: 700, fontSize: '1.4rem' }}>
                {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
              </span>
              <span style={{ flex: 1, fontWeight: 600 }}>{entry.name}</span>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {entry.score.toLocaleString('sr-Latn-RS')}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Common layout for `viewing` and `placing`: photo dominates the center,
 * header above, footer below. Header and footer rows reserve stable height
 * so transitioning between phases doesn't shift the photo (the previous
 * version popped the photo down by the height of the footer when the
 * "Tapni mapu..." instruction appeared in `placing`).
 *
 * The image itself is the rendered element — there's no fixed-aspect frame,
 * so portrait/landscape/square photos all fill the available area at their
 * own native ratio, with no letterbox bars.
 */
function PhotoFocusLayout({
  header,
  imageUrl,
  footer,
}: {
  header: React.ReactNode;
  imageUrl: string;
  footer?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Explicit width so the column fills GameScreen — the host's #root
        // is `align-items: center` which doesn't stretch flex items, so
        // without this the layout shrinks to content width and the photo
        // never grows past its intrinsic SVG size.
        width: '100%',
        height: '100%',
        padding: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '2rem',
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
          minHeight: '2rem',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
        }}
      >
        {header}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '1rem 0',
        }}
      >
        <img
          src={imageUrl}
          alt=""
          style={{
            // Width/height: 100% (not max-*) so the img element fills the
            // flex container even when the source has no intrinsic size
            // (e.g. an SVG without explicit width/height). object-fit then
            // scales the image bits to fit at the natural aspect ratio.
            // Empty area inside the box is transparent — no black bars.
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            borderRadius: '0.5rem',
          }}
        />
      </div>
      <p
        style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '1rem',
          margin: 0,
          // Reserved height — viewing has no footer text but we still keep
          // the box so the photo above doesn't shift when placing's text
          // appears.
          minHeight: '1.5rem',
        }}
      >
        {footer ?? ' '}
      </p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontSize: '1.4rem',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  );
}
