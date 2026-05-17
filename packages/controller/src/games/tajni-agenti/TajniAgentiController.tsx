import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { useHaptics } from '../../hooks/useHaptics';
import type {
  TajniAgentiPublicCard,
  TajniAgentiSecretCard,
  TajniAgentiCardType,
  TajniAgentiClue,
  TajniAgentiPublicRosters,
  TajniAgentiTeam,
  TajniAgentiTurnResultsData,
  TajniAgentiEndedData,
} from '@igra/shared';

const TEAM_RED = '#e74c3c';
const TEAM_BLUE = '#3498db';
const NEUTRAL = '#cdc7b8';
const ASSASSIN = '#1a1a2e';

const typeColor = (t: TajniAgentiCardType): string => {
  if (t === 'red') return TEAM_RED;
  if (t === 'blue') return TEAM_BLUE;
  if (t === 'neutral') return NEUTRAL;
  return ASSASSIN;
};

const teamLabel = (t: TajniAgentiTeam): string =>
  t === 'red' ? 'Crveni' : 'Plavi';

interface MyData {
  team: TajniAgentiTeam | null;
  isSpymaster: boolean;
  isCurrentSpymaster: boolean;
  isCurrentGuesser: boolean;
  secretCards?: TajniAgentiSecretCard[];
}

export default function TajniAgentiController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const roomPlayers = usePlayerStore((s) => s.room?.players ?? []);

  if (!gameState || !playerId) return null;
  const { phase, data, playerData } = gameState;
  const my = (playerData[playerId] as unknown as MyData | undefined) ?? {
    team: null,
    isSpymaster: false,
    isCurrentSpymaster: false,
    isCurrentGuesser: false,
  };

  if (phase === 'team-selection') {
    return (
      <TeamSelectionController
        playerId={playerId}
        myTeam={my.team}
        isSpymaster={my.isSpymaster}
        rosters={data.rosters as TajniAgentiPublicRosters | undefined}
        roomPlayers={roomPlayers}
      />
    );
  }

  if (phase === 'clue-giving') {
    if (my.isCurrentSpymaster) {
      return <ClueGivingForm secretCards={my.secretCards ?? []} />;
    }
    if (my.isSpymaster) {
      return (
        <SpymasterWaitingView
          secretCards={my.secretCards ?? []}
          subTitle="Drugi špijun bira šifru…"
        />
      );
    }
    const currentTeam = data.currentTeam as TajniAgentiTeam;
    return (
      <WaitingMessage
        title={`${teamLabel(currentTeam)} špijun bira šifru…`}
        subtitle={
          my.team === currentTeam
            ? 'Pripremi se da pogađaš.'
            : 'Drugi tim je na potezu.'
        }
        accent={typeColor(currentTeam)}
      />
    );
  }

  if (phase === 'guessing') {
    const cards = (data.cards as TajniAgentiPublicCard[]) ?? [];
    const clue = data.currentClue as TajniAgentiClue | undefined;
    const guessesRemaining = data.guessesRemaining as number | undefined;
    if (my.isCurrentGuesser) {
      return (
        <GuessingGrid
          cards={cards}
          clue={clue}
          guessesRemaining={guessesRemaining ?? 0}
        />
      );
    }
    if (my.isSpymaster) {
      return (
        <SpymasterWaitingView
          secretCards={my.secretCards ?? []}
          subTitle={
            my.isCurrentSpymaster
              ? 'Tvoj tim pogađa.'
              : 'Drugi tim pogađa.'
          }
          clue={clue}
        />
      );
    }
    const currentTeam = data.currentTeam as TajniAgentiTeam;
    return (
      <WaitingMessage
        title={`${teamLabel(currentTeam)} tim pogađa…`}
        subtitle={
          clue
            ? `Šifra: ${clue.word.toUpperCase()} · ${clue.count}`
            : undefined
        }
        accent={typeColor(currentTeam)}
      />
    );
  }

  if (phase === 'turn-results') {
    const results = data.turnResults as TajniAgentiTurnResultsData | undefined;
    if (!results) return null;
    return <TurnResultsScreen results={results} />;
  }

  if (phase === 'ended') {
    const ended = data.ended as TajniAgentiEndedData | undefined;
    if (!ended) return null;
    return <EndedScreen ended={ended} myTeam={my.team} />;
  }

  return null;
}

// ============================================================ team-selection

interface RosterPlayer {
  id: string;
  name: string;
  avatarColor: string;
}

function TeamSelectionController({
  playerId,
  myTeam,
  isSpymaster,
  rosters,
  roomPlayers,
}: {
  playerId: string;
  myTeam: TajniAgentiTeam | null;
  isSpymaster: boolean;
  rosters: TajniAgentiPublicRosters | undefined;
  roomPlayers: RosterPlayer[];
}) {
  const haptics = useHaptics();
  const pickTeam = (team: TajniAgentiTeam | null) => {
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'tajni-agenti:pick-team',
      data: { team },
    });
  };
  const toggleSpymaster = () => {
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'tajni-agenti:toggle-spymaster',
      data: {},
    });
  };

  const mySpymasterId =
    myTeam === 'red'
      ? rosters?.red.spymasterId ?? null
      : myTeam === 'blue'
        ? rosters?.blue.spymasterId ?? null
        : null;
  // Disabled when on no team, OR when someone else has already claimed
  // the spymaster slot on my team (toggle is still allowed for me to
  // release my own claim).
  const canClaim =
    myTeam !== null && (mySpymasterId === null || mySpymasterId === playerId);

  const claimTakenByOther =
    myTeam !== null &&
    mySpymasterId !== null &&
    mySpymasterId !== playerId;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem',
        height: '100%',
      }}
    >
      <p
        style={{
          margin: 0,
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        Izaberi tim
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.6rem',
          flex: '1 1 auto',
        }}
      >
        <TeamCard
          color={TEAM_RED}
          label="Crveni"
          playerIds={rosters?.red.playerIds ?? []}
          spymasterId={rosters?.red.spymasterId ?? null}
          selected={myTeam === 'red'}
          onPick={() => pickTeam('red')}
          roomPlayers={roomPlayers}
          myPlayerId={playerId}
        />
        <TeamCard
          color={TEAM_BLUE}
          label="Plavi"
          playerIds={rosters?.blue.playerIds ?? []}
          spymasterId={rosters?.blue.spymasterId ?? null}
          selected={myTeam === 'blue'}
          onPick={() => pickTeam('blue')}
          roomPlayers={roomPlayers}
          myPlayerId={playerId}
        />
      </div>

      <button
        onClick={toggleSpymaster}
        disabled={!canClaim}
        style={{
          padding: '0.85rem',
          fontSize: '1rem',
          fontWeight: 700,
          borderRadius: '0.6rem',
          background: isSpymaster ? 'var(--accent)' : 'var(--bg-secondary)',
          color: isSpymaster ? '#fff' : 'var(--text-primary)',
          border: `2px solid ${
            isSpymaster ? 'var(--accent)' : 'var(--text-secondary)'
          }`,
          opacity: canClaim ? 1 : 0.4,
          cursor: canClaim ? 'pointer' : 'not-allowed',
        }}
      >
        {isSpymaster ? '✓ Špijun' : 'Špijun'}
      </button>

      {claimTakenByOther && (
        <p
          style={{
            margin: 0,
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}
        >
          Tvoj tim već ima špijuna.
        </p>
      )}

      {rosters?.rosterIssue && (
        <p
          style={{
            margin: 0,
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}
        >
          {rosters.rosterIssue}
        </p>
      )}
    </div>
  );
}

function TeamCard({
  color,
  label,
  playerIds,
  spymasterId,
  selected,
  onPick,
  roomPlayers,
  myPlayerId,
}: {
  color: string;
  label: string;
  playerIds: string[];
  spymasterId: string | null;
  selected: boolean;
  onPick: () => void;
  roomPlayers: RosterPlayer[];
  myPlayerId: string;
}) {
  const nameOf = (id: string) =>
    roomPlayers.find((p) => p.id === id)?.name ?? '?';
  const colorOf = (id: string) =>
    roomPlayers.find((p) => p.id === id)?.avatarColor ?? '#888';
  return (
    <button
      onClick={onPick}
      style={{
        background: color,
        opacity: selected ? 1 : 0.55,
        borderRadius: '1rem',
        border: selected ? '4px solid #fff' : '4px solid transparent',
        color: '#fff',
        fontWeight: 800,
        padding: '0.7rem 0.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '0.45rem',
        transition: 'opacity 0.15s',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: '1.05rem',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.85 }}>
          {playerIds.length} {playerIds.length === 1 ? 'igrač' : 'igrača'}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}
      >
        {playerIds.length === 0 && (
          <span
            style={{
              fontSize: '0.75rem',
              opacity: 0.7,
              fontWeight: 500,
            }}
          >
            (prazno)
          </span>
        )}
        {playerIds.map((id) => {
          const isMe = id === myPlayerId;
          const isSpy = spymasterId === id;
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '0.15rem 0.35rem',
                background: 'rgba(0,0,0,0.18)',
                borderLeft: `3px solid ${colorOf(id)}`,
                borderRadius: '0.25rem',
              }}
            >
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {nameOf(id)}
                {isMe && (
                  <span style={{ opacity: 0.7, fontWeight: 500 }}> (ja)</span>
                )}
              </span>
              {isSpy && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    background: '#fff',
                    color,
                    padding: '0.05rem 0.3rem',
                    borderRadius: '0.2rem',
                    letterSpacing: '0.04em',
                  }}
                >
                  ŠPIJUN
                </span>
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ============================================================ clue-giving

function ClueGivingForm({
  secretCards,
}: {
  secretCards: TajniAgentiSecretCard[];
}) {
  const haptics = useHaptics();
  const [word, setWord] = useState('');
  const [count, setCount] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    const cleaned = word.trim();
    if (!cleaned || /\s/.test(cleaned)) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'tajni-agenti:submit-clue',
      data: { word: cleaned, count },
    });
    setSubmitted(true);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        padding: '0.75rem',
        height: '100%',
      }}
    >
      <p
        style={{
          margin: 0,
          textAlign: 'center',
          fontWeight: 700,
          color: 'var(--accent)',
        }}
      >
        Ti si špijun — daj šifru.
      </p>
      <SecretMiniBoard cards={secretCards} />
      <input
        type="text"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        placeholder="Jedna reč"
        disabled={submitted}
        maxLength={30}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{
          padding: '0.65rem',
          fontSize: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--text-secondary)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}
      >
        <button
          onClick={() => setCount((c) => Math.max(1, c - 1))}
          disabled={submitted}
          style={stepperBtn}
        >
          −
        </button>
        <span
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            minWidth: '2rem',
            textAlign: 'center',
          }}
        >
          {count}
        </span>
        <button
          onClick={() => setCount((c) => Math.min(9, c + 1))}
          disabled={submitted}
          style={stepperBtn}
        >
          +
        </button>
      </div>
      <button
        onClick={submit}
        disabled={submitted || !word.trim() || /\s/.test(word.trim())}
        style={{
          padding: '0.85rem',
          fontSize: '1rem',
          fontWeight: 700,
          borderRadius: '0.6rem',
          background: 'var(--accent)',
          color: '#fff',
          opacity: submitted || !word.trim() ? 0.5 : 1,
        }}
      >
        {submitted ? 'Poslato' : 'Pošalji šifru'}
      </button>
    </div>
  );
}

const stepperBtn: React.CSSProperties = {
  width: '2.5rem',
  height: '2.5rem',
  borderRadius: '0.5rem',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '1.4rem',
  fontWeight: 700,
  border: '1px solid var(--text-secondary)',
};

// ============================================================ guessing

function GuessingGrid({
  cards,
  clue,
  guessesRemaining,
}: {
  cards: TajniAgentiPublicCard[];
  clue: TajniAgentiClue | undefined;
  guessesRemaining: number;
}) {
  const haptics = useHaptics();
  const tap = (cardId: number) => {
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'tajni-agenti:guess-card',
      data: { cardId },
    });
  };
  const endTurn = () => {
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'tajni-agenti:end-turn',
      data: {},
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.5rem',
        height: '100%',
      }}
    >
      {clue && (
        <p
          style={{
            margin: 0,
            textAlign: 'center',
            fontWeight: 800,
            fontSize: '1rem',
            color: typeColor(clue.team),
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {clue.word} · {clue.count}
          <span
            style={{
              marginLeft: '0.5rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            ostalo: {guessesRemaining}
          </span>
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '0.3rem',
          flex: '1 1 auto',
        }}
      >
        {cards.map((card) => {
          const bg =
            card.revealed && card.type ? typeColor(card.type) : '#f3eedd';
          const fg = card.revealed
            ? card.type === 'assassin'
              ? '#e74c3c'
              : '#fff'
            : '#2b2412';
          return (
            <button
              key={card.id}
              onClick={() => !card.revealed && tap(card.id)}
              disabled={card.revealed}
              style={{
                background: bg,
                color: fg,
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '0.15rem',
                borderRadius: '0.35rem',
                textTransform: 'uppercase',
                wordBreak: 'break-word',
                lineHeight: 1.05,
                minHeight: '48px',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {card.word}
            </button>
          );
        })}
      </div>
      <button
        onClick={endTurn}
        style={{
          padding: '0.65rem',
          fontSize: '0.9rem',
          fontWeight: 700,
          borderRadius: '0.5rem',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--text-secondary)',
        }}
      >
        Završi potez
      </button>
    </div>
  );
}

// ============================================================ spymaster waiting

function SpymasterWaitingView({
  secretCards,
  subTitle,
  clue,
}: {
  secretCards: TajniAgentiSecretCard[];
  subTitle: string;
  clue?: TajniAgentiClue;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.5rem',
        height: '100%',
      }}
    >
      <p
        style={{
          margin: 0,
          textAlign: 'center',
          fontSize: '0.95rem',
          color: 'var(--text-secondary)',
        }}
      >
        {subTitle}
      </p>
      {clue && (
        <p
          style={{
            margin: 0,
            textAlign: 'center',
            fontWeight: 800,
            color: typeColor(clue.team),
            textTransform: 'uppercase',
          }}
        >
          {clue.word} · {clue.count}
        </p>
      )}
      <SecretMiniBoard cards={secretCards} />
    </div>
  );
}

function SecretMiniBoard({ cards }: { cards: TajniAgentiSecretCard[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '0.3rem',
        flex: '1 1 auto',
      }}
    >
      {cards.map((card) => {
        const fill = typeColor(card.type);
        return (
          <div
            key={card.id}
            style={{
              background: fill,
              color: card.type === 'assassin' ? '#e74c3c' : '#fff',
              fontSize: '0.6rem',
              fontWeight: 700,
              padding: '0.15rem',
              borderRadius: '0.35rem',
              textTransform: 'uppercase',
              textAlign: 'center',
              wordBreak: 'break-word',
              lineHeight: 1.05,
              minHeight: '46px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: card.revealed ? 0.55 : 1,
              textDecoration: card.revealed ? 'line-through' : 'none',
              boxShadow: card.revealed
                ? 'inset 0 0 0 2px rgba(255,255,255,0.4)'
                : 'none',
            }}
          >
            {card.word}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================ waiting

function WaitingMessage({
  title,
  subtitle,
  accent,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.6rem',
        height: '100%',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '1.15rem',
          fontWeight: 700,
          color: accent ?? 'var(--text-primary)',
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p
          style={{
            margin: 0,
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ============================================================ turn-results & ended

function TurnResultsScreen({
  results,
}: {
  results: TajniAgentiTurnResultsData;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        padding: '1rem',
        height: '100%',
      }}
    >
      <p
        style={{
          margin: 0,
          textAlign: 'center',
          fontWeight: 800,
          color: typeColor(results.team),
        }}
      >
        {teamLabel(results.team)} tim — kraj poteza
      </p>
      {results.clue && (
        <p
          style={{
            margin: 0,
            textAlign: 'center',
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
          }}
        >
          Šifra je bila <strong>{results.clue.word.toUpperCase()}</strong> ·{' '}
          {results.clue.count}
        </p>
      )}
      <ul
        style={{
          margin: 0,
          paddingLeft: '1.1rem',
          fontSize: '0.9rem',
        }}
      >
        {results.log.map((entry, i) => (
          <li key={i} style={{ color: typeColor(entry.revealedType) }}>
            <strong>{entry.word.toUpperCase()}</strong> — {entry.guesserName}
          </li>
        ))}
      </ul>
      {results.nextTeam && (
        <p
          style={{
            margin: 0,
            textAlign: 'center',
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
          }}
        >
          Sledeći potez:{' '}
          <strong style={{ color: typeColor(results.nextTeam) }}>
            {teamLabel(results.nextTeam)} tim
          </strong>
        </p>
      )}
    </div>
  );
}

function EndedScreen({
  ended,
  myTeam,
}: {
  ended: TajniAgentiEndedData;
  myTeam: TajniAgentiTeam | null;
}) {
  const won = myTeam !== null && myTeam === ended.winner;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '1.5rem',
        background: typeColor(ended.winner),
        color: '#fff',
        textAlign: 'center',
        gap: '0.5rem',
      }}
    >
      <p style={{ margin: 0, fontSize: '1rem', opacity: 0.85 }}>
        {won ? 'POBEDA!' : myTeam ? 'PORAZ' : 'KRAJ IGRE'}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: '2rem',
          fontWeight: 800,
          letterSpacing: '0.05em',
        }}
      >
        {teamLabel(ended.winner).toUpperCase()} TIM
      </p>
    </div>
  );
}
