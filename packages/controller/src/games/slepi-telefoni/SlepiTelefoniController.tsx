import { useState, useEffect } from 'react';
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
    return <WaitingScreen message="Otkriva se na velikom ekranu!" />;
  }

  if (phase === 'voting') {
    if (myData.hasVoted)
      return <WaitingScreen message="Glas poslat — čekamo ostale..." />;
    if (!myData.chainsForVoting)
      return <WaitingScreen message="Učitavanje..." />;
    return (
      <FavoriteVote
        chains={myData.chainsForVoting}
        ownChainIndex={myData.ownChainIndex ?? -1}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'winner') {
    return <WaitingScreen message="Pobednički lanac se prikazuje..." />;
  }

  if (phase === 'final-leaderboard' || phase === 'ended') {
    const entry = host?.finalLeaderboard?.find((e) => e.playerId === playerId);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        {entry ? (
          <>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
              Konačno mesto
            </p>
            <p
              style={{
                fontSize: '3rem',
                fontWeight: 800,
                color: 'var(--accent)',
              }}
            >
              #{entry.rank}
            </p>
            <p style={{ fontSize: '1.3rem', fontWeight: 600 }}>
              {entry.score} {entry.score === 1 ? 'glas' : 'glasova'}
            </p>
          </>
        ) : (
          <p style={{ fontSize: '1.2rem' }}>Konačni poredak na velikom ekranu</p>
        )}
      </div>
    );
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

function FavoriteVote({
  chains,
  ownChainIndex,
  timeRemaining,
}: {
  chains: {
    chainIndex: number;
    originName: string;
    originColor: string;
    lastItem: {
      kind: 'prompt' | 'drawing' | 'guess';
      text?: string;
      strokes?: Stroke[];
    };
  }[];
  ownChainIndex: number;
  timeRemaining: number;
}) {
  const vote = (chainIndex: number) => {
    if (chainIndex === ownChainIndex) return;
    socket.emit('game:player-action', {
      action: 'slepi:vote-favorite',
      data: { chainIndex },
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
        <p style={{ fontSize: '1rem', fontWeight: 700 }}>Omiljeni lanac?</p>
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
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        {chains.map((c) => {
          const isOwn = c.chainIndex === ownChainIndex;
          return (
            <button
              key={c.chainIndex}
              onClick={() => vote(c.chainIndex)}
              disabled={isOwn}
              style={{
                padding: '0.75rem',
                background: isOwn ? 'var(--bg-card)' : 'var(--bg-secondary)',
                border: `2px solid ${c.originColor}`,
                borderRadius: '10px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                opacity: isOwn ? 0.45 : 1,
                color: 'var(--text-primary)',
                cursor: isOwn ? 'not-allowed' : 'pointer',
              }}
            >
              <span style={{ color: c.originColor, fontWeight: 700 }}>
                {c.originName}
                {isOwn && ' (tvoj lanac)'}
              </span>
              {c.lastItem.kind === 'drawing' ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  [crtež]
                </span>
              ) : (
                <span style={{ fontSize: '0.95rem' }}>„{c.lastItem.text}”</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
