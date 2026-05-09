import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { DrawingPad } from '../draw-guess/components/DrawingPad';
import type {
  SlepiTelefoniControllerData,
  SlepiTelefoniHostData,
  Stroke,
} from '@igra/shared';

const MAX_PROMPT_LENGTH = 80;
const MAX_GUESS_LENGTH = 80;

export default function SlepiTelefoniController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const remoteHostPlayerId = usePlayerStore(
    (s) => s.room?.remoteHostPlayerId ?? null
  );

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const myData = playerData[playerId] as unknown as SlepiTelefoniControllerData | undefined;
  const host = data.host as SlepiTelefoniHostData | undefined;

  if (!myData) {
    return <WaitingScreen message="Učitavanje..." />;
  }

  if (phase === 'entering-prompts') {
    if (myData.hasSubmitted) return <WaitingScreen message="Čekamo ostale..." />;
    return <PromptEntry timeRemaining={timeRemaining} />;
  }

  if (phase === 'drawing-step') {
    if (myData.hasSubmitted)
      return <WaitingScreen message="Crtež poslat — čekamo ostale..." />;
    if (!myData.promptToDraw) return <WaitingScreen message="Samo posmatraš..." />;
    return (
      <DrawingRound
        prompt={myData.promptToDraw}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'guess-step') {
    if (myData.hasSubmitted)
      return <WaitingScreen message="Pogodak poslat — čekamo ostale..." />;
    if (!myData.drawingToGuess) return <WaitingScreen message="Samo posmatraš..." />;
    return (
      <GuessRound
        strokes={myData.drawingToGuess}
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
    return <WaitingScreen message="Otkriva se na velikom ekranu!" />;
  }

  if (phase === 'ended') {
    return <EndedScreen />;
  }

  return <WaitingScreen message="Učitavanje..." />;
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
        Kraj igre
      </p>
      <p
        style={{
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        Pogledaj veliki ekran za rezultate
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
        <span style={{ fontSize: '0.9rem' }}>Vraćanje na izbor igre…</span>
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
        🎮 Tvoja kontrola
      </p>
      <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
        Otkrivanje na velikom ekranu
      </p>
      {totalChains > 0 && (
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
          Lanac {chainNumber}/{totalChains}
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
        {isLast ? 'Završi igru →' : 'Sledeći lanac →'}
      </button>
    </div>
  );
}

function PromptEntry({ timeRemaining }: { timeRemaining: number }) {
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
        <p style={{ fontSize: '1rem', fontWeight: 600 }}>Napiši frazu</p>
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
        Sledeći igrač će pokušati da je nacrta!
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
        maxLength={MAX_PROMPT_LENGTH}
        placeholder="npr. Pingvin jede sladoled"
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
        Pošalji
      </button>
    </div>
  );
}

function DrawingRound({
  prompt,
  timeRemaining,
}: {
  prompt: string;
  timeRemaining: number;
}) {
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
          Nacrtaj
        </p>
        <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>„{prompt}”</p>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DrawingPad
          timeRemaining={timeRemaining}
          strokeAction="slepi:stroke"
          clearAction="slepi:clear"
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
          Gotovo
        </button>
      </div>
    </div>
  );
}

function GuessRound({
  strokes,
  timeRemaining,
}: {
  strokes: Stroke[];
  timeRemaining: number;
}) {
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
        <p style={{ fontSize: '1rem', fontWeight: 600 }}>Šta vidiš?</p>
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
      <SmallStrokePreview strokes={strokes} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_GUESS_LENGTH))}
        maxLength={MAX_GUESS_LENGTH}
        placeholder="Upiši šta misliš da je..."
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
        Pošalji
      </button>
    </div>
  );
}

function SmallStrokePreview({ strokes }: { strokes: Stroke[] }) {
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasEl;
    ctx.clearRect(0, 0, width, height);
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
      }
      ctx.stroke();
    }
  }, [canvasEl, strokes]);

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
