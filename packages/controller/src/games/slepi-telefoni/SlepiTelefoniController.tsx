import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { useT } from '../../i18n/useT';
import { DrawingPad } from '../draw-guess/components/DrawingPad';
import { GameFrame } from '../../components/kit/GameFrame';
import type {
  Chain,
  DrawOp,
  SlepiTelefoniControllerData,
  SlepiTelefoniHostData,
} from '@igra/shared';
import { visibleOps, legacyStrokesToOps } from '@igra/shared';

const MAX_PROMPT_LENGTH = 80;
const MAX_GUESS_LENGTH = 80;
/** Hostless reveal: one chain item every this many ms, like a story. */
const REVEAL_STEP_MS = 600;
/** Placeholder ideas rotate this often so nobody stares at an empty box. */
const IDEA_ROTATE_MS = 2600;

export default function SlepiTelefoniController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const t = useT();

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as SlepiTelefoniHostData | undefined;
  const timed =
    phase === 'entering-prompts' || phase === 'drawing-step' || phase === 'guess-step';
  let subtitle: string | undefined;
  if ((phase === 'drawing-step' || phase === 'guess-step') && host)
    subtitle = t('slepi.step', { n: host.stepIndex + 1, total: host.totalSteps });
  else if (phase === 'reveal' && host?.totalChains)
    subtitle = t('slepi.chain', { n: (host.currentRevealChain ?? 0) + 1, total: host.totalChains });
  else if (phase === 'ended') subtitle = t('slepi.gameOver');

  return (
    <GameFrame
      gameId="slepi-telefoni"
      subtitle={subtitle}
      timeRemaining={timed ? timeRemaining : undefined}
      urgentAt={10}
      roundKey={timed ? `${phase}:${host?.stepIndex ?? 0}` : undefined}
    >
      <Body playerId={playerId} />
    </GameFrame>
  );
}

function Body({ playerId }: { playerId: string }) {
  const gameState = useGameStore((s) => s.gameState)!;
  const remoteHostPlayerId = usePlayerStore((s) => s.room?.remoteHostPlayerId ?? null);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const t = useT();

  const { phase, data, playerData } = gameState;
  const myData = playerData[playerId] as unknown as SlepiTelefoniControllerData | undefined;
  const host = data.host as SlepiTelefoniHostData | undefined;

  if (!myData) {
    return <WaitingScreen message={t('common.loading')} />;
  }

  if (phase === 'entering-prompts') {
    if (myData.hasSubmitted) return <WaitingScreen message={t('common.waitingForOthers')} />;
    return <PromptEntry />;
  }

  if (phase === 'drawing-step') {
    if (myData.hasSubmitted) return <WaitingScreen message={t('slepi.drawingSent')} />;
    if (!myData.promptToDraw) return <WaitingScreen message={t('slepi.spectating')} />;
    return <DrawingRound prompt={myData.promptToDraw} operations={myData.myDraft ?? []} />;
  }

  if (phase === 'guess-step') {
    if (myData.hasSubmitted) return <WaitingScreen message={t('slepi.guessSent')} />;
    if (!myData.drawingToGuess) return <WaitingScreen message={t('slepi.spectating')} />;
    return <GuessRound operations={myData.drawingToGuess} />;
  }

  if (phase === 'reveal') {
    const chainNumber = (host?.currentRevealChain ?? 0) + 1;
    const totalChains = host?.totalChains ?? 0;

    // Hostless room: there is no TV to reveal on — render the whole
    // current chain on every phone (chainBeingRevealed is public host
    // data). The control holder gets the advance button under the chain.
    if (hostless) {
      return (
        <HostlessReveal
          chain={host?.chainBeingRevealed}
          chainNumber={chainNumber}
          totalChains={totalChains}
          isController={remoteHostPlayerId === playerId}
        />
      );
    }

    if (remoteHostPlayerId === playerId) {
      return (
        <RevealRemoteHostControl
          chainNumber={chainNumber}
          totalChains={totalChains}
          isLast={totalChains > 0 && chainNumber >= totalChains}
        />
      );
    }
    return <WaitingScreen message={t('slepi.revealingOnScreen')} />;
  }

  if (phase === 'ended') {
    return <EndedScreen hostless={hostless} />;
  }

  return <WaitingScreen message={t('common.loading')} />;
}

function WaitingScreen({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: '9px' }}>
        <span
          style={{
            width: '13px',
            height: '13px',
            borderRadius: '50%',
            background: 'var(--pink)',
            animation: 'igra-floaty 1.2s infinite',
          }}
        />
        <span
          style={{
            width: '13px',
            height: '13px',
            borderRadius: '50%',
            background: 'var(--violet)',
            animation: 'igra-floaty 1.2s infinite .2s',
          }}
        />
        <span
          style={{
            width: '13px',
            height: '13px',
            borderRadius: '50%',
            background: 'var(--cyan)',
            animation: 'igra-floaty 1.2s infinite .4s',
          }}
        />
      </div>
      <p className="display" style={{ fontSize: '1.35rem', fontWeight: 600, margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

function EndedScreen({ hostless }: { hostless: boolean }) {
  const t = useT();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1.25rem',
        padding: '1.5rem',
        textAlign: 'center',
      }}
    >
      <p className="display" style={{ fontSize: '2.2rem', fontWeight: 700, margin: 0, animation: 'igra-pop .5s' }}>
        {t('slepi.gameOver')}
      </p>
      <p
        style={{
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        {hostless ? t('slepi.thanks') : t('slepi.seeBigScreen')}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginTop: '0.5rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span
          style={{
            width: '22px',
            height: '22px',
            border: '3px solid rgba(255, 255, 255, 0.15)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'igra-spin 0.9s linear infinite',
          }}
        />
        <span style={{ fontSize: '0.9rem' }}>{t('common.returningToGameSelect')}</span>
      </div>
    </div>
  );
}

function HostlessReveal({
  chain,
  chainNumber,
  totalChains,
  isController,
}: {
  chain: Chain | undefined;
  chainNumber: number;
  totalChains: number;
  isController: boolean;
}) {
  const t = useT();
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const isLast = totalChains > 0 && chainNumber >= totalChains;
  // Same click guard as RevealRemoteHostControl — one tap per chain.
  const lockedRef = useRef(false);
  useEffect(() => {
    lockedRef.current = false;
  }, [chainNumber]);

  const advance = () => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    socket.emit('host:game-action', { action: 'slepi:next-chain' });
  };

  const kindLabel = (kind: string) =>
    kind === 'drawing' ? t('slepi.drew') : kind === 'guess' ? t('slepi.guessed') : t('slepi.wrote');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10, paddingTop: 12 }}>
      {chain && (
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textAlign: 'right',
          }}
        >
          {t('slepi.chainOf', { name: chain.originName })}
        </span>
      )}

      {/* Keyed by chain so a new chain replays the story from the top. */}
      <div
        key={chainNumber}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {(chain?.items ?? []).map((item, i) => {
          const emoji = roster.find((p) => p.id === item.authorId)?.avatarEmoji;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                padding: 12,
                borderRadius: 16,
                background: 'rgba(245,235,224,.05)',
                flexShrink: 0,
                opacity: 0,
                animation: `igra-rise .4s ease-out ${i * REVEAL_STEP_MS}ms forwards`,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '30%',
                  background: item.authorColor,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.95rem',
                  flexShrink: 0,
                }}
              >
                {emoji}
              </span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--dim)',
                  }}
                >
                  {item.authorName} {kindLabel(item.kind)}:
                </span>
                {item.kind === 'drawing' ? (
                  <SmallOpsPreview operations={item.operations ?? legacyStrokesToOps(item.strokes)} />
                ) : (
                  <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>„{item.text}”</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isController && (
        <button onClick={advance} className="btn-primary" style={{ flexShrink: 0 }}>
          {isLast ? t('slepi.finishGame') : t('slepi.nextChain')}
        </button>
      )}
    </div>
  );
}

function RevealRemoteHostControl({
  chainNumber,
  totalChains,
  isLast,
}: {
  chainNumber: number;
  totalChains: number;
  isLast: boolean;
}) {
  const t = useT();
  // Reset the click guard whenever the chain advances so each chain
  // gets a fresh tap.
  const lockedRef = useRef(false);
  useEffect(() => {
    lockedRef.current = false;
  }, [chainNumber]);

  const advance = () => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    socket.emit('host:game-action', { action: 'slepi:next-chain' });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1.25rem',
        padding: '1.5rem',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
        {t('slepi.yourControl')}
      </p>
      <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
        {t('slepi.revealOnScreen')}
      </p>
      {totalChains > 0 && (
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
          {t('slepi.chain', { n: chainNumber, total: totalChains })}
        </p>
      )}
      <button
        onClick={advance}
        className="btn-primary"
        style={{ minWidth: '220px' }}
      >
        {isLast ? t('slepi.finishGame') : t('slepi.nextChain')}
      </button>
    </div>
  );
}

/** Cyan chip at the top of the write/guess screens. */
function StepChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        alignSelf: 'flex-start',
        height: 32,
        padding: '0 12px',
        borderRadius: 10,
        background: 'rgba(111,194,187,.14)',
        color: 'var(--cyan)',
        fontSize: '0.82rem',
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

const fieldStyle: React.CSSProperties = {
  borderRadius: 16,
  border: '1.5px solid var(--cyan)',
  boxShadow: '0 0 0 4px rgba(111,194,187,.12)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  fontWeight: 800,
};

function PromptEntry() {
  const t = useT();
  const [text, setText] = useState('');
  const ideas = t('slepi.ideas').split('|');
  const [idea, setIdea] = useState(0);

  // Rotate the placeholder while the box is empty.
  useEffect(() => {
    if (text) return;
    const timer = setInterval(() => setIdea((n) => (n + 1) % ideas.length), IDEA_ROTATE_MS);
    return () => clearInterval(timer);
  }, [text, ideas.length]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('game:player-action', {
      action: 'slepi:submit-prompt',
      data: { text: trimmed },
    });
  };

  return (
    // The field takes what's left, so with the keyboard open it shrinks and
    // the send button stays above the keyboard.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: 14 }}>
      <StepChip>✍️ {t('slepi.writePrompt')}</StepChip>
      <span
        className="display"
        style={{ marginTop: 14, fontWeight: 700, fontSize: '1.7rem', lineHeight: 1.1, flexShrink: 0 }}
      >
        {t('slepi.nextPlayerDraws')}
      </span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
        maxLength={MAX_PROMPT_LENGTH}
        placeholder={ideas[idea % ideas.length]}
        style={{
          ...fieldStyle,
          marginTop: 14,
          flex: 1,
          minHeight: 72,
          padding: 16,
          fontSize: '1.3rem',
          lineHeight: 1.3,
          resize: 'none',
        }}
      />
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: 'var(--dim)',
          flexShrink: 0,
        }}
      >
        <span>{t('slepi.funnier')}</span>
        <span>
          {text.length}/{MAX_PROMPT_LENGTH}
        </span>
      </div>
      <button
        className="btn-primary"
        onClick={submit}
        disabled={text.trim().length === 0}
        style={{ marginTop: 12, flexShrink: 0 }}
      >
        {t('common.send')} ✓
      </button>
    </div>
  );
}

function DrawingRound({ prompt, operations }: { prompt: string; operations: DrawOp[] }) {
  const t = useT();
  const submit = () => {
    socket.emit('game:player-action', {
      action: 'slepi:submit-drawing',
      data: {},
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DrawingPad
          operations={operations}
          actionPrefix="slepi"
          header={
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 16,
                background: 'rgba(217,123,108,.14)',
                border: '1px solid rgba(217,123,108,.4)',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('slepi.draw')}
              </span>
              <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>„{prompt}”</span>
            </div>
          }
        />
      </div>
      {/* Always visible; when time runs out the drawing goes as it is. */}
      <button onClick={submit} className="btn-primary" style={{ marginTop: 10, flexShrink: 0 }}>
        {t('slepi.done')}
      </button>
    </div>
  );
}

function GuessRound({ operations }: { operations: DrawOp[] }) {
  const t = useT();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('game:player-action', {
      action: 'slepi:submit-guess',
      data: { text: trimmed },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: 14 }}>
      <StepChip>👀 {t('slepi.whatDoYouSee')}</StepChip>
      <div style={{ marginTop: 14, flexShrink: 0 }}>
        <SmallOpsPreview operations={operations} />
      </div>
      <span
        style={{
          marginTop: 14,
          fontSize: '0.9rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        {t('slepi.describeOne')}
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_GUESS_LENGTH))}
        maxLength={MAX_GUESS_LENGTH}
        placeholder={t('slepi.guessPlaceholder')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        style={{ ...fieldStyle, marginTop: 12, height: 60, padding: '0 16px', fontSize: '1.1rem', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minHeight: 12 }} />
      <button
        className="btn-primary"
        onClick={submit}
        disabled={text.trim().length === 0}
        style={{ flexShrink: 0 }}
      >
        {t('common.send')} ✓
      </button>
    </div>
  );
}

function SmallOpsPreview({ operations }: { operations: DrawOp[] }) {
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasEl;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    for (const op of visibleOps(operations)) {
      if (op.kind === 'stroke') {
        if (op.points.length < 2) continue;
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(op.points[0].x * width, op.points[0].y * height);
        for (let i = 1; i < op.points.length; i++) {
          ctx.lineTo(op.points[i].x * width, op.points[i].y * height);
        }
        ctx.stroke();
      }
    }
  }, [canvasEl, operations]);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        width: '100%',
        aspectRatio: '4 / 3',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={setCanvasEl}
        width={400}
        height={300}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
