import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { useT } from '../../i18n/useT';
import { DrawingPad } from '../draw-guess/components/DrawingPad';
import type {
  DrawOp,
  SlepiTelefoniControllerData,
  SlepiTelefoniHostData,
} from '@igra/shared';
import { visibleOps } from '@igra/shared';

const MAX_PROMPT_LENGTH = 80;
const MAX_GUESS_LENGTH = 80;

export default function SlepiTelefoniController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const remoteHostPlayerId = usePlayerStore(
    (s) => s.room?.remoteHostPlayerId ?? null
  );
  const t = useT();

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const myData = playerData[playerId] as unknown as SlepiTelefoniControllerData | undefined;
  const host = data.host as SlepiTelefoniHostData | undefined;

  if (!myData) {
    return <WaitingScreen message={t('common.loading')} />;
  }

  if (phase === 'entering-prompts') {
    if (myData.hasSubmitted)
      return <WaitingScreen message={t('common.waitingForOthers')} />;
    return <PromptEntry timeRemaining={timeRemaining} />;
  }

  if (phase === 'drawing-step') {
    if (myData.hasSubmitted)
      return <WaitingScreen message={t('slepi.drawingSent')} />;
    if (!myData.promptToDraw)
      return <WaitingScreen message={t('slepi.spectating')} />;
    return (
      <DrawingRound
        prompt={myData.promptToDraw}
        timeRemaining={timeRemaining}
        operations={myData.myDraft ?? []}
      />
    );
  }

  if (phase === 'guess-step') {
    if (myData.hasSubmitted)
      return <WaitingScreen message={t('slepi.guessSent')} />;
    if (!myData.drawingToGuess)
      return <WaitingScreen message={t('slepi.spectating')} />;
    return (
      <GuessRound
        operations={myData.drawingToGuess}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'reveal') {
    if (remoteHostPlayerId === playerId) {
      const chainNumber = (host?.currentRevealChain ?? 0) + 1;
      const totalChains = host?.totalChains ?? 0;
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
    return <EndedScreen />;
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
      <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>{message}</p>
    </div>
  );
}

function EndedScreen() {
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
      <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>
        {t('slepi.gameOver')}
      </p>
      <p
        style={{
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        {t('slepi.seeBigScreen')}
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
        style={{
          padding: '0.9rem 1.75rem',
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: '999px',
          fontSize: '1.1rem',
          fontWeight: 700,
          minHeight: '52px',
          minWidth: '220px',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {isLast ? t('slepi.finishGame') : t('slepi.nextChain')}
      </button>
    </div>
  );
}

function PromptEntry({ timeRemaining }: { timeRemaining: number }) {
  const t = useT();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('game:player-action', {
      action: 'slepi:submit-prompt',
      data: { text: trimmed },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '1rem',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: '1rem', fontWeight: 600 }}>{t('slepi.writePrompt')}</p>
        <span
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {timeRemaining}s
        </span>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {t('slepi.nextPlayerDraws')}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
        maxLength={MAX_PROMPT_LENGTH}
        placeholder={t('slepi.promptPlaceholder')}
        style={{
          flex: 1,
          padding: '0.75rem',
          fontSize: '1rem',
          borderRadius: '8px',
          border: '2px solid var(--bg-card)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          resize: 'none',
          fontFamily: 'inherit',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span>{text.length}/{MAX_PROMPT_LENGTH}</span>
      </div>
      <button
        onClick={submit}
        disabled={text.trim().length === 0}
        style={{
          padding: '0.9rem',
          fontSize: '1.1rem',
          fontWeight: 700,
          background: text.trim() ? 'var(--accent)' : 'var(--bg-card)',
          color: '#fff',
          borderRadius: '10px',
          minHeight: '48px',
          opacity: text.trim() ? 1 : 0.6,
        }}
      >
        {t('common.send')}
      </button>
    </div>
  );
}

function DrawingRound({
  prompt,
  timeRemaining,
  operations,
}: {
  prompt: string;
  timeRemaining: number;
  operations: DrawOp[];
}) {
  const t = useT();
  const submit = () => {
    socket.emit('game:player-action', {
      action: 'slepi:submit-drawing',
      data: {},
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
      }}
    >
      <div
        style={{
          padding: '0.5rem 0.75rem',
          background: 'var(--bg-card)',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {t('slepi.draw')}
        </p>
        <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>„{prompt}”</p>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DrawingPad
          timeRemaining={timeRemaining}
          operations={operations}
          actionPrefix="slepi"
        />
      </div>
      <div style={{ padding: '0.5rem 0.75rem' }}>
        <button
          onClick={submit}
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '1rem',
            fontWeight: 700,
            background: 'var(--success)',
            color: '#fff',
            borderRadius: '10px',
            minHeight: '44px',
          }}
        >
          {t('slepi.done')}
        </button>
      </div>
    </div>
  );
}

function GuessRound({
  operations,
  timeRemaining,
}: {
  operations: DrawOp[];
  timeRemaining: number;
}) {
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.75rem',
        gap: '0.6rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: '1rem', fontWeight: 600 }}>{t('slepi.whatDoYouSee')}</p>
        <span
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {timeRemaining}s
        </span>
      </div>
      <SmallOpsPreview operations={operations} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_GUESS_LENGTH))}
        maxLength={MAX_GUESS_LENGTH}
        placeholder={t('slepi.guessPlaceholder')}
        style={{
          padding: '0.75rem',
          fontSize: '1rem',
          borderRadius: '8px',
          border: '2px solid var(--bg-card)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
        }}
      />
      <button
        onClick={submit}
        disabled={text.trim().length === 0}
        style={{
          padding: '0.9rem',
          fontSize: '1.1rem',
          fontWeight: 700,
          background: text.trim() ? 'var(--accent)' : 'var(--bg-card)',
          color: '#fff',
          borderRadius: '10px',
          minHeight: '48px',
          opacity: text.trim() ? 1 : 0.6,
        }}
      >
        {t('common.send')}
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
        borderRadius: '10px',
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
