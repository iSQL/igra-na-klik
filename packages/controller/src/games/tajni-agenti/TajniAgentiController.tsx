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

const TEAM_RED = '#C75146';
const TEAM_BLUE = '#4F80B8';
const NEUTRAL = '#C9B896';
const ASSASSIN = '#0B1728';

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
  const remoteHostPlayerId = usePlayerStore(
    (s) => s.room?.remoteHostPlayerId ?? null
  );
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;
  const { phase, data, playerData } = gameState;
  const my = (playerData[playerId] as unknown as MyData | undefined) ?? {
    team: null,
    isSpymaster: false,
    isCurrentSpymaster: false,
    isCurrentGuesser: false,
  };

  const isScenarioMode = Boolean(data.isScenarioMode);
  const isRemoteHost = remoteHostPlayerId === playerId;

  if (phase === 'team-selection') {
    return (
      <TeamSelectionController
        playerId={playerId}
        myTeam={my.team}
        isSpymaster={my.isSpymaster}
        rosters={data.rosters as TajniAgentiPublicRosters | undefined}
        roomPlayers={roomPlayers}
        isScenarioMode={isScenarioMode}
        isRemoteHost={isRemoteHost}
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
    const title = `${teamLabel(currentTeam)} špijun bira šifru…`;
    const subtitle =
      my.team === currentTeam
        ? 'Pripremi se da pogađaš.'
        : 'Drugi tim je na potezu.';
    // Hostless: no TV, so waiting players follow the board on their phone.
    if (hostless) {
      return (
        <WaitingBoard
          cards={(data.cards as TajniAgentiPublicCard[]) ?? []}
          title={title}
          subtitle={subtitle}
          accent={typeColor(currentTeam)}
        />
      );
    }
    return (
      <WaitingMessage
        title={title}
        subtitle={subtitle}
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
    const title = `${teamLabel(currentTeam)} tim pogađa…`;
    const subtitle = clue
      ? `Šifra: ${clue.word.toUpperCase()} · ${clue.count}`
      : undefined;
    // Hostless: show the read-only board so everyone can follow the guesses.
    if (hostless) {
      return (
        <WaitingBoard
          cards={cards}
          clue={clue}
          title={title}
          subtitle={subtitle}
          accent={typeColor(currentTeam)}
        />
      );
    }
    return (
      <WaitingMessage
        title={title}
        subtitle={subtitle}
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
  avatarEmoji: string;
}

function TeamSelectionController({
  playerId,
  myTeam,
  isSpymaster,
  rosters,
  roomPlayers,
  isScenarioMode,
  isRemoteHost,
}: {
  playerId: string;
  myTeam: TajniAgentiTeam | null;
  isSpymaster: boolean;
  rosters: TajniAgentiPublicRosters | undefined;
  roomPlayers: RosterPlayer[];
  isScenarioMode: boolean;
  isRemoteHost: boolean;
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
  const startRound = () => {
    haptics.tap();
    socket.emit('host:game-action', {
      action: 'tajni-agenti:start-round',
      data: {},
    });
  };
  const autoBalance = () => {
    haptics.tap();
    socket.emit('host:game-action', {
      action: 'tajni-agenti:auto-balance',
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
          spymasterId={isScenarioMode ? null : rosters?.red.spymasterId ?? null}
          selected={myTeam === 'red'}
          onPick={() => pickTeam('red')}
          roomPlayers={roomPlayers}
          myPlayerId={playerId}
        />
        <TeamCard
          color={TEAM_BLUE}
          label="Plavi"
          playerIds={rosters?.blue.playerIds ?? []}
          spymasterId={isScenarioMode ? null : rosters?.blue.spymasterId ?? null}
          selected={myTeam === 'blue'}
          onPick={() => pickTeam('blue')}
          roomPlayers={roomPlayers}
          myPlayerId={playerId}
        />
      </div>

      {!isScenarioMode && (
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
      )}

      {isScenarioMode && (
        <p
          style={{
            margin: 0,
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          Scenario: nema špijuna — tema reči je vaša šifra.
        </p>
      )}

      {!isScenarioMode && claimTakenByOther && (
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

      {isRemoteHost && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}
        >
          <button
            onClick={autoBalance}
            style={{
              flex: 1,
              padding: '0.7rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              borderRadius: '0.6rem',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--text-secondary)',
            }}
          >
            Pomiri timove
          </button>
          <button
            onClick={startRound}
            disabled={!rosters?.readyToStart}
            style={{
              flex: 1,
              padding: '0.7rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              borderRadius: '0.6rem',
              background: rosters?.readyToStart
                ? 'var(--accent)'
                : 'var(--bg-secondary)',
              color: '#fff',
              border: 'none',
              opacity: rosters?.readyToStart ? 1 : 0.5,
              cursor: rosters?.readyToStart ? 'pointer' : 'not-allowed',
            }}
          >
            Počni rundu
          </button>
        </div>
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
  const emojiOf = (id: string) =>
    roomPlayers.find((p) => p.id === id)?.avatarEmoji ?? '';
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
                {emojiOf(id)} {nameOf(id)}
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
          fontWeight: 800,
          fontFamily: 'var(--font-display)',
          borderRadius: '12px',
          border: '1.5px solid var(--line2)',
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
        className="btn-primary"
        onClick={submit}
        disabled={submitted || !word.trim() || /\s/.test(word.trim())}
      >
        {submitted ? 'Poslato ✓' : 'Pošalji šifru ➤'}
      </button>
    </div>
  );
}

const stepperBtn: React.CSSProperties = {
  width: '3rem',
  height: '3rem',
  borderRadius: '12px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '1.4rem',
  fontWeight: 800,
  border: '1.5px solid var(--line2)',
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
              ? 'var(--danger)'
              : card.type === 'neutral'
                ? '#2b230f'
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
              color:
                card.type === 'assassin'
                  ? 'var(--danger)'
                  : card.type === 'neutral'
                    ? '#2b230f'
                    : '#fff',
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

// Hostless-only: a read-only board with a status header, shown to players who
// are waiting (not the active guesser/spymaster) so they can follow along on
// their phone when there is no TV. Never interactive — no card taps.
function WaitingBoard({
  cards,
  clue,
  title,
  subtitle,
  accent,
}: {
  cards: TajniAgentiPublicCard[];
  clue?: TajniAgentiClue;
  title: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        padding: '0.5rem',
        height: '100%',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.95rem',
            fontWeight: 800,
            color: accent ?? 'var(--text-primary)',
          }}
        >
          {title}
        </p>
        {(clue || subtitle) && (
          <p
            style={{
              margin: '0.1rem 0 0',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            {clue ? `Šifra: ${clue.word.toUpperCase()} · ${clue.count}` : subtitle}
          </p>
        )}
      </div>
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
              ? 'var(--danger)'
              : card.type === 'neutral'
                ? '#2b230f'
                : '#fff'
            : '#2b2412';
          return (
            <div
              key={card.id}
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                opacity: card.revealed ? 1 : 0.92,
              }}
            >
              {card.word}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      {results.winner && (
        <p
          style={{
            margin: '0.3rem 0 0',
            textAlign: 'center',
            fontSize: '1.15rem',
            fontWeight: 800,
            color: typeColor(results.winner),
          }}
        >
          🏆 {teamLabel(results.winner)} tim pobeđuje!
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
          fontSize: won ? '2rem' : '1.6rem',
          fontWeight: 800,
          letterSpacing: '0.05em',
          lineHeight: 1.1,
        }}
      >
        {won
          ? `${teamLabel(ended.winner).toUpperCase()} TIM`
          : `POBEDIO ${teamLabel(ended.winner).toUpperCase()} TIM`}
      </p>
    </div>
  );
}
