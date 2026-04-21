import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  Chain,
  ChainItem,
  SlepiTelefoniHostData,
} from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { useRoomStore } from '../../store/roomStore';
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
      if (phase === 'winner') play('victory');
      if (phase === 'final-leaderboard') play('victory');
      prevPhaseRef.current = phase;
    }

    if (
      phase === 'entering-prompts' ||
      phase === 'drawing-step' ||
      phase === 'guess-step' ||
      phase === 'voting'
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
    return (
      <ChainReveal
        chain={host.chainBeingRevealed}
        chainNumber={(host.currentRevealChain ?? 0) + 1}
        totalChains={host.chainsForVoting?.length ?? players.length}
      />
    );
  }

  if (phase === 'voting' && host.chainsForVoting) {
    return (
      <FavoriteVotingHost
        chains={host.chainsForVoting}
        voteCounts={host.voteCounts ?? {}}
        voted={host.votedCount ?? 0}
        total={host.totalVoters ?? 0}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'winner' && host.winnerChain) {
    return (
      <WinnerScreen
        chain={host.winnerChain}
        votes={host.winnerVotes ?? 0}
      />
    );
  }

  if (phase === 'final-leaderboard' && host.finalLeaderboard) {
    return <FinalLeaderboardHost entries={host.finalLeaderboard} />;
  }

  return null;
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
}: {
  chain: Chain;
  chainNumber: number;
  totalChains: number;
}) {
  const pairs = buildDrawingGuessPairs(chain);
  const firstPrompt = chain.items[0];

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
        alignItems: 'center',
        height: '100%',
        width: '100%',
        padding: '1rem 1.5rem',
        gap: '0.75rem',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Lanac {chainNumber}/{totalChains}
        </p>
        {firstPrompt?.kind === 'prompt' && (
          <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>
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
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(pairs.length, 1)}, minmax(0, 1fr))`,
          gap: '1rem',
          alignItems: 'stretch',
          justifyItems: 'center',
        }}
      >
        {pairs.map((pair, i) => (
          <DrawingGuessPair key={i} pair={pair} />
        ))}
      </div>
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
        gap: '0.5rem',
        width: '100%',
        maxWidth: '360px',
      }}
    >
      <AuthorBadge item={pair.drawing} labelOverride="nacrtao" />
      <DrawingCanvas
        strokes={pair.drawing.strokes ?? []}
        width={320}
        height={240}
      />
      {pair.guess ? (
        <>
          <AuthorBadge item={pair.guess} labelOverride="napisao" />
          <p
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              textAlign: 'center',
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-card)',
              borderRadius: '10px',
              maxWidth: '100%',
            }}
          >
            „{pair.guess.text}”
          </p>
        </>
      ) : (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          (niko nije pogodio)
        </p>
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

function FavoriteVotingHost({
  chains,
  voteCounts,
  voted,
  total,
  timeRemaining,
}: {
  chains: Chain[];
  voteCounts: Record<number, number>;
  voted: number;
  total: number;
  timeRemaining: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '1.25rem',
        width: '100%',
        height: '100%',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>
        Glasajte za najbolji lanac
      </h1>
      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          fontSize: '1rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span>{voted}/{total} glasalo</span>
        <CountdownBadge timeRemaining={timeRemaining} />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1rem',
          width: '100%',
        }}
      >
        {chains.map((chain) => {
          const count = voteCounts[chain.chainIndex] ?? 0;
          const first = chain.items[0];
          const last = chain.items[chain.items.length - 1];
          return (
            <div
              key={chain.chainIndex}
              style={{
                padding: '0.85rem',
                background: 'var(--bg-card)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: chain.originColor, fontWeight: 700 }}>
                  {chain.originName}
                </span>
                <motion.span
                  key={count}
                  initial={{ scale: 1.4 }}
                  animate={{ scale: 1 }}
                  style={{
                    padding: '0.15rem 0.55rem',
                    background: 'var(--accent)',
                    color: '#fff',
                    borderRadius: '999px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                  }}
                >
                  {count}
                </motion.span>
              </div>
              {first?.kind === 'prompt' && first.text && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  „{first.text}”
                </p>
              )}
              {last?.kind === 'guess' && last.text && (
                <p style={{ fontSize: '1rem', fontWeight: 600 }}>→ „{last.text}”</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WinnerScreen({
  chain,
  votes,
}: {
  chain: Chain;
  votes: number;
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
      <h1 style={{ fontSize: '2.6rem', fontWeight: 800 }}>
        🏆 Pobednički lanac
      </h1>
      <p style={{ fontSize: '1.3rem' }}>
        Počeo: <span style={{ color: chain.originColor, fontWeight: 700 }}>{chain.originName}</span>
      </p>
      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
        {votes} {votes === 1 ? 'glas' : 'glasova'}
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.65rem',
          maxWidth: '720px',
        }}
      >
        {chain.items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
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
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {item.authorName}:
            </span>
            {item.kind === 'drawing' ? (
              <span style={{ fontSize: '0.9rem' }}>[crtež]</span>
            ) : (
              <span style={{ fontSize: '1rem', fontWeight: 600 }}>
                „{item.text}”
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FinalLeaderboardHost({
  entries,
}: {
  entries: {
    playerId: string;
    name: string;
    avatarColor: string;
    score: number;
    rank: number;
  }[];
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1.5rem',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '2.2rem', fontWeight: 800 }}>Konačni poredak</h1>
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {entries.map((entry) => (
          <div
            key={entry.playerId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-secondary)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--accent)',
                  minWidth: '2ch',
                }}
              >
                #{entry.rank}
              </span>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: entry.avatarColor,
                }}
              />
              <span style={{ fontWeight: 600 }}>{entry.name}</span>
            </div>
            <span style={{ fontWeight: 700 }}>
              {entry.score} {entry.score === 1 ? 'glas' : 'glasova'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
