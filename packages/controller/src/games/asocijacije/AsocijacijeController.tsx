import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import type {
  AsocijacijeColumnView,
  AsocijacijeControllerData,
  AsocijacijeHostData,
} from '@igra/shared';

function act(action: string, data: Record<string, unknown> = {}) {
  socket.emit('game:player-action', { action, data });
}

export default function AsocijacijeController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;
  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as AsocijacijeHostData | undefined;
  const my = playerData[playerId] as unknown as AsocijacijeControllerData | undefined;
  if (!host) return null;

  const isActive = !!my?.isActive;

  if (phase === 'leaderboard' || phase === 'ended') {
    return <ResultsView host={host} playerId={playerId} phase={phase} />;
  }
  if (phase === 'board-results') {
    return <BoardResultsView host={host} playerId={playerId} hostless={hostless} />;
  }
  return (
    <PlayingView
      host={host}
      isActive={isActive}
      hostless={hostless}
      timeRemaining={timeRemaining}
    />
  );
}

function PlayingView({
  host,
  isActive,
  hostless,
  timeRemaining,
}: {
  host: AsocijacijeHostData;
  isActive: boolean;
  hostless: boolean;
  timeRemaining: number;
}) {
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [colGuess, setColGuess] = useState('');
  const [finalOpen, setFinalOpen] = useState(false);
  const [finalGuess, setFinalGuess] = useState('');
  const colInputRef = useRef<HTMLInputElement>(null);

  // Reset all transient input UI whenever the turn phase flips or the seat
  // changes hands.
  useEffect(() => {
    setSelectedCol(null);
    setColGuess('');
    setFinalOpen(false);
    setFinalGuess('');
  }, [host.turnPhase, isActive]);

  const answering = isActive && host.question && host.turnPhase === 'answering-field';
  const canOpen = isActive && host.turnPhase === 'awaiting-open';
  const canGuessCol = isActive && host.turnPhase === 'awaiting-guess';
  const canGuessFinal =
    isActive &&
    (host.turnPhase === 'awaiting-open' || host.turnPhase === 'awaiting-guess');

  const openField = (col: number, field: number) => act('asoc:open', { col, field });
  const selectColumn = (col: number) => {
    setSelectedCol(col);
    setColGuess('');
    setTimeout(() => colInputRef.current?.focus(), 30);
  };
  const sendColumn = () => {
    if (selectedCol === null || !colGuess.trim()) return;
    act('asoc:guess-column', { col: selectedCol, text: colGuess.trim() });
    setSelectedCol(null);
    setColGuess('');
  };
  const sendFinal = () => {
    if (!finalGuess.trim()) return;
    act('asoc:guess-final', { text: finalGuess.trim() });
    setFinalGuess('');
    setFinalOpen(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '0.7rem',
        gap: '0.6rem',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <TurnHeader host={host} isActive={isActive} timeRemaining={timeRemaining} />

      {host.lastResult && (
        <div
          style={{
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '0.9rem',
            padding: '0.35rem 0.5rem',
            borderRadius: '10px',
            color: host.lastResult.correct ? '#1c7a4a' : '#8a2b1f',
            background: host.lastResult.correct
              ? 'rgba(47,224,138,.16)'
              : 'rgba(229,83,60,.14)',
          }}
        >
          {host.lastResult.text}
        </div>
      )}

      {answering ? (
        <QuestionPanel host={host} />
      ) : (
        <>
          {(isActive || hostless) && (
            <CompactBoard
              host={host}
              canOpen={canOpen}
              canGuessCol={canGuessCol}
              selectedCol={selectedCol}
              onOpen={openField}
              onSelectCol={selectColumn}
            />
          )}

          {isActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.2rem' }}>
              {canOpen && (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                  {host.boardFullyOpen
                    ? 'Sva polja su otvorena — tapni kolonu da je pogodiš.'
                    : 'Tapni zatvoreno polje da ga otvoriš.'}
                </p>
              )}
              {canGuessCol && selectedCol === null && (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                  Tapni kolonu da je pogodiš, ili pokušaj konačno rešenje.
                </p>
              )}

              {/* Column guess — appears only after tapping a column */}
              {canGuessCol && selectedCol !== null && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    padding: '0.6rem',
                    borderRadius: '12px',
                    background: 'var(--bg-secondary)',
                    borderLeft: `5px solid ${host.columns[selectedCol].color}`,
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    Rešenje · Kolona {host.columns[selectedCol].letter}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      ref={colInputRef}
                      value={colGuess}
                      onChange={(e) => setColGuess(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendColumn()}
                      placeholder="Ukucaj rešenje kolone"
                      style={inputStyle}
                    />
                    <button onClick={sendColumn} style={sendBtnStyle}>
                      Pošalji
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedCol(null)}
                    style={{
                      alignSelf: 'flex-start',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      padding: '0.1rem 0',
                    }}
                  >
                    Otkaži
                  </button>
                </div>
              )}

              {/* Final solution — button, input only after tapping it */}
              {canGuessFinal && !finalOpen && (
                <button
                  onClick={() => setFinalOpen(true)}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '12px',
                    border: '2px solid var(--gold, #C29B47)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontWeight: 800,
                    fontSize: '1rem',
                  }}
                >
                  Konačno rešenje?
                </button>
              )}
              {canGuessFinal && finalOpen && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    padding: '0.6rem',
                    borderRadius: '12px',
                    background: 'rgba(194,155,71,.12)',
                    border: '1px solid var(--gold, #C29B47)',
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Konačno rešenje</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      value={finalGuess}
                      onChange={(e) => setFinalGuess(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendFinal()}
                      placeholder="Ukucaj konačno rešenje"
                      autoFocus
                      style={inputStyle}
                    />
                    <button
                      onClick={sendFinal}
                      style={{ ...sendBtnStyle, background: 'var(--gold, #C29B47)', color: '#1D2A44' }}
                    >
                      Pošalji
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setFinalOpen(false);
                      setFinalGuess('');
                    }}
                    style={{
                      alignSelf: 'flex-start',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      padding: '0.1rem 0',
                    }}
                  >
                    Otkaži
                  </button>
                </div>
              )}

              {canGuessCol && (
                <button
                  onClick={() => act('asoc:pass')}
                  style={{
                    padding: '0.7rem',
                    borderRadius: '12px',
                    border: '1px solid var(--line2, rgba(255,255,255,.2))',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  Predaj potez ↦
                </button>
              )}
            </div>
          )}

          {!isActive && !hostless && (
            <p
              style={{
                textAlign: 'center',
                color: 'var(--text-secondary)',
                marginTop: '1.5rem',
              }}
            >
              Gledaj TV — na potezu je <strong>{host.activePlayerName}</strong>.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TurnHeader({
  host,
  isActive,
  timeRemaining,
}: {
  host: AsocijacijeHostData;
  isActive: boolean;
  timeRemaining: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
      }}
    >
      <div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
          {isActive ? 'TVOJ POTEZ' : `Na potezu: ${host.activePlayerName ?? '—'}`}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Tabla {host.board}/{host.totalBoards} ·{' '}
          {host.mode === 'kviz' ? 'kviz mod' : 'klasik'}
        </div>
      </div>
      <div
        style={{
          fontWeight: 800,
          fontSize: '1.4rem',
          color: timeRemaining <= 10 ? 'var(--danger, #E5533C)' : 'var(--text-primary)',
        }}
      >
        {timeRemaining}s
      </div>
    </div>
  );
}

function CompactBoard({
  host,
  canOpen,
  canGuessCol,
  selectedCol,
  onOpen,
  onSelectCol,
}: {
  host: AsocijacijeHostData;
  canOpen: boolean;
  canGuessCol: boolean;
  selectedCol: number | null;
  onOpen: (col: number, field: number) => void;
  onSelectCol: (col: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
        {host.columns.map((col, ci) => (
          <ColumnMini
            key={col.letter}
            col={col}
            colIndex={ci}
            canOpen={canOpen}
            canGuessCol={canGuessCol}
            selected={selectedCol === ci}
            onOpen={onOpen}
            onSelectCol={onSelectCol}
          />
        ))}
      </div>
    </div>
  );
}

function ColumnMini({
  col,
  colIndex,
  canOpen,
  canGuessCol,
  selected,
  onOpen,
  onSelectCol,
}: {
  col: AsocijacijeColumnView;
  colIndex: number;
  canOpen: boolean;
  canGuessCol: boolean;
  selected: boolean;
  onOpen: (col: number, field: number) => void;
  onSelectCol: (col: number) => void;
}) {
  const colTappable = canGuessCol && !col.solved;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {/* Fields */}
      {col.fields.map((f, fi) => {
        const canTap = canOpen && !f.open;
        return (
          <button
            key={f.num}
            disabled={!canTap}
            onClick={canTap ? () => onOpen(colIndex, fi) : undefined}
            style={{
              border: canTap ? '2px solid var(--gold, #C29B47)' : '2px solid transparent',
              borderRadius: '7px',
              padding: '0.3rem 0.15rem',
              minHeight: '2.1rem',
              background: f.open ? 'var(--bg-card)' : col.color,
              color: f.open ? 'var(--text-primary)' : '#1D2A44',
              fontWeight: 800,
              fontSize: f.open ? '0.72rem' : '0.85rem',
              lineHeight: 1,
              cursor: canTap ? 'pointer' : 'default',
              wordBreak: 'break-word',
            }}
          >
            {f.open ? f.word : f.num}
          </button>
        );
      })}

      {/* Column solution bar (bottom) — tappable to guess when it's your turn */}
      <button
        disabled={!colTappable}
        onClick={colTappable ? () => onSelectCol(colIndex) : undefined}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          padding: '0.28rem 0.15rem',
          borderRadius: '7px',
          background: col.solved ? col.color : 'var(--bg-secondary)',
          color: col.solved ? '#1D2A44' : 'var(--text-secondary)',
          border: selected
            ? '2px solid var(--text-primary)'
            : colTappable
              ? '2px solid var(--gold, #C29B47)'
              : '2px solid transparent',
          fontWeight: 800,
          minHeight: '2.2rem',
          cursor: colTappable ? 'pointer' : 'default',
          lineHeight: 1.05,
          wordBreak: 'break-word',
        }}
      >
        <span style={{ fontSize: '0.58rem', letterSpacing: '.02em', opacity: 0.85 }}>
          Kolona {col.letter}
        </span>
        <span style={{ fontSize: col.solved ? '0.72rem' : '0.9rem' }}>
          {col.solved ? col.solution : '?'}
        </span>
      </button>
    </div>
  );
}

function QuestionPanel({ host }: { host: AsocijacijeHostData }) {
  const q = host.question!;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '0.3rem' }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ color: 'var(--gold, #C29B47)', fontWeight: 800 }}>{q.fieldNum}</span>
      </div>
      <p style={{ fontSize: '1.15rem', fontWeight: 800, textAlign: 'center', margin: 0 }}>
        {q.text}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => act('asoc:answer', { optionIndex: i })}
            style={{
              padding: '0.9rem',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 800,
              fontSize: '1.05rem',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '0.7rem 0.8rem',
  borderRadius: '10px',
  border: '1px solid var(--line2, rgba(255,255,255,.2))',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  fontSize: '1rem',
  fontWeight: 700,
  textTransform: 'uppercase',
};

const sendBtnStyle: React.CSSProperties = {
  padding: '0.7rem 1rem',
  borderRadius: '10px',
  border: 'none',
  background: 'var(--accent, #5FC2B8)',
  color: '#1D2A44',
  fontWeight: 800,
  flexShrink: 0,
};

function BoardResultsView({
  host,
  playerId,
  hostless,
}: {
  host: AsocijacijeHostData;
  playerId: string;
  hostless: boolean;
}) {
  const summary = (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
        Konačno rešenje
      </p>
      <p style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.1rem 0', color: 'var(--gold, #C29B47)' }}>
        {host.finalSolution}
      </p>
      {host.boardWinnerName && (
        <p style={{ fontWeight: 700, margin: 0 }}>🏆 {host.boardWinnerName}</p>
      )}
    </div>
  );

  if (hostless && host.leaderboard) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center' }}>{summary}</div>
        <div style={{ flex: 1, minHeight: 0, borderTop: '1px solid var(--line)' }}>
          <HostlessLeaderboard title="Rang lista" entries={host.leaderboard} myPlayerId={playerId} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: '1.5rem' }}>
      {summary}
    </div>
  );
}

function ResultsView({
  host,
  playerId,
  phase,
}: {
  host: AsocijacijeHostData;
  playerId: string;
  phase: string;
}) {
  const entries = host.leaderboard ?? host.scores;
  const me = entries.find((e) => e.playerId === playerId);
  if (phase === 'leaderboard') {
    return (
      <div style={{ height: '100%' }}>
        <HostlessLeaderboard title="Rang lista" entries={entries} myPlayerId={playerId} />
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '0.8rem',
        padding: '1.5rem',
      }}
    >
      <p style={{ color: 'var(--text-secondary)' }}>Konačni plasman</p>
      {me && (
        <>
          <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--gold, #C29B47)' }}>
            #{me.rank}
          </p>
          <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>{me.score.toLocaleString()} poena</p>
        </>
      )}
    </div>
  );
}
