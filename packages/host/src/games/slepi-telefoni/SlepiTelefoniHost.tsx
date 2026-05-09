import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type {
  Chain,
  ChainItem,
  SlepiTelefoniHostData,
} from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { useRoomStore } from '../../store/roomStore';
import { socket } from '../../socket';
import { DrawingCanvas } from '../draw-guess/components/DrawingCanvas';

export default function SlepiTelefoniHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;

    if (phase !== prevPhaseRef.current) {
      if (phase === 'reveal') play('reveal');
      prevPhaseRef.current = phase;
    }

    if (
      phase === 'entering-prompts' ||
      phase === 'drawing-step' ||
      phase === 'guess-step'
    ) {
      const currSec = Math.ceil(timeRemaining);
      const prevSec = Math.ceil(prevTimeRef.current);
      if (currSec !== prevSec && currSec <= 5 && currSec > 0) {
        play('tick');
      }
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as SlepiTelefoniHostData;

  if (phase === 'entering-prompts') {
    return (
      <PromptEntryHost
        submitted={host.submittedCount}
        total={host.totalSubmitters}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'drawing-step' || phase === 'guess-step') {
    return (
      <StepInProgressHost
        kind={phase === 'drawing-step' ? 'drawing' : 'guess'}
        stepIndex={host.stepIndex}
        totalSteps={host.totalSteps}
        submitted={host.submittedCount}
        total={host.totalSubmitters}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'reveal' && host.chainBeingRevealed) {
    const chainNumber = (host.currentRevealChain ?? 0) + 1;
    const totalChains = host.totalChains ?? players.length;
    return (
      <ChainReveal
        chain={host.chainBeingRevealed}
        chainNumber={chainNumber}
        totalChains={totalChains}
        isLast={chainNumber >= totalChains}
      />
    );
  }

  if (phase === 'ended') {
    return <EndedScreen />;
  }

  return null;
}

function EndedScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1.75rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '3rem', fontWeight: 800, margin: 0 }}>
        Kraj igre
      </h1>
      <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', margin: 0 }}>
        Hvala što ste igrali Slepe telefone!
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          marginTop: '1rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span
          style={{
            width: '32px',
            height: '32px',
            border: '4px solid rgba(255, 255, 255, 0.15)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'igra-spin 0.9s linear infinite',
          }}
        />
        <span style={{ fontSize: '1rem' }}>Vraćanje na izbor igre…</span>
      </div>
    </motion.div>
  );
}

function PromptEntryHost({
  submitted,
  total,
  timeRemaining,
}: {
  submitted: number;
  total: number;
  timeRemaining: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        height: '100%',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>
        Napišite početnu frazu
      </h1>
      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
        Svako unosi svoju frazu koju će sledeći igrač pokušati da nacrta.
      </p>
      <CountdownBadge timeRemaining={timeRemaining} />
      <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>
        {submitted}/{total} napisalo
      </p>
    </div>
  );
}

function StepInProgressHost({
  kind,
  stepIndex,
  totalSteps,
  submitted,
  total,
  timeRemaining,
}: {
  kind: 'drawing' | 'guess';
  stepIndex: number;
  totalSteps: number;
  submitted: number;
  total: number;
  timeRemaining: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        height: '100%',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
        Korak {stepIndex}/{totalSteps}
      </p>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>
        {kind === 'drawing' ? 'Svi crtaju' : 'Svi pogađaju'}
      </h1>
      <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: '520px' }}>
        {kind === 'drawing'
          ? 'Svako dobije tuđu frazu i pokušava da je nacrta — bez pogleda u druge lance!'
          : 'Svako dobije tuđi crtež i piše šta misli da je prikazano.'}
      </p>
      <CountdownBadge timeRemaining={timeRemaining} />
      <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>
        {submitted}/{total} završilo
      </p>
    </div>
  );
}

function CountdownBadge({ timeRemaining }: { timeRemaining: number }) {
  const urgent = timeRemaining <= 5;
  return (
    <div
      style={{
        padding: '0.5rem 1.25rem',
        background: urgent ? 'var(--danger)' : 'var(--bg-card)',
        borderRadius: '999px',
        fontSize: '1.4rem',
        fontWeight: 700,
        color: '#fff',
        minWidth: '80px',
        textAlign: 'center',
      }}
    >
      {timeRemaining}s
    </div>
  );
}

function ChainReveal({
  chain,
  chainNumber,
  totalChains,
  isLast,
}: {
  chain: Chain;
  chainNumber: number;
  totalChains: number;
  isLast: boolean;
}) {
  const pairs = buildDrawingGuessPairs(chain);
  const firstPrompt = chain.items[0];

  // Reset the guard whenever the chain changes so each chain gets a fresh click.
  const advanceLockedRef = useRef(false);
  useEffect(() => {
    advanceLockedRef.current = false;
  }, [chain.chainIndex]);

  const handleAdvance = () => {
    if (advanceLockedRef.current) return;
    advanceLockedRef.current = true;
    socket.emit('host:game-action', { action: 'slepi:next-chain' });
  };

  return (
    <motion.div
      key={chain.chainIndex}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        height: '100%',
        width: '100%',
        padding: '0.5rem 1rem',
        gap: '0.5rem',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.15rem',
          flexShrink: 0,
        }}
      >
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
          Lanac {chainNumber}/{totalChains}
        </p>
        {firstPrompt?.kind === 'prompt' && (
          <p style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
            <span style={{ color: firstPrompt.authorColor }}>
              {firstPrompt.authorName}
            </span>
            : „{firstPrompt.text}”
          </p>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          padding: '0.5rem 0',
        }}
      >
        {pairs.map((pair, i) => (
          <DrawingGuessPair key={i} pair={pair} />
        ))}
      </div>

      <button
        onClick={handleAdvance}
        style={{
          alignSelf: 'center',
          padding: '0.6rem 1.5rem',
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: '999px',
          fontSize: '1rem',
          fontWeight: 700,
          cursor: 'pointer',
          border: 'none',
          minHeight: '44px',
          flexShrink: 0,
        }}
      >
        {isLast ? 'Završi igru →' : 'Sledeći lanac →'}
      </button>
    </motion.div>
  );
}

type DrawingGuessPair = {
  drawing: ChainItem;
  guess: ChainItem | null;
};

function buildDrawingGuessPairs(chain: Chain): DrawingGuessPair[] {
  const pairs: DrawingGuessPair[] = [];
  for (let i = 0; i < chain.items.length; i++) {
    const item = chain.items[i];
    if (item.kind !== 'drawing') continue;
    const next = chain.items[i + 1];
    pairs.push({
      drawing: item,
      guess: next && next.kind === 'guess' ? next : null,
    });
  }
  return pairs;
}

function DrawingGuessPair({ pair }: { pair: DrawingGuessPair }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        width: '100%',
        maxWidth: '720px',
      }}
    >
      <AuthorBadge item={pair.drawing} labelOverride="nacrtao" />
      <DrawingCanvas
        strokes={pair.drawing.strokes ?? []}
        width={640}
        height={480}
      />
      {pair.guess && (
        <>
          <AuthorBadge item={pair.guess} labelOverride="napisao" />
          <p
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              textAlign: 'center',
              padding: '0.6rem 1rem',
              background: 'var(--bg-card)',
              borderRadius: '10px',
              maxWidth: '100%',
              margin: 0,
            }}
          >
            „{pair.guess.text}”
          </p>
        </>
      )}
    </div>
  );
}

function AuthorBadge({
  item,
  labelOverride,
}: {
  item: ChainItem;
  labelOverride?: string;
}) {
  const label =
    labelOverride ??
    (item.kind === 'prompt'
      ? 'napisao'
      : item.kind === 'drawing'
        ? 'nacrtao'
        : 'pogodio');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
      }}
    >
      <span
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: item.authorColor,
        }}
      />
      <span style={{ fontWeight: 600 }}>{item.authorName}</span>
      <span>{label}</span>
    </div>
  );
}

