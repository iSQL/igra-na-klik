import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import { socket } from '../../socket';
import type {
  TajniAgentiPublicCard,
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

const teamColor = (t: TajniAgentiCardType): string => {
  if (t === 'red') return TEAM_RED;
  if (t === 'blue') return TEAM_BLUE;
  if (t === 'neutral') return NEUTRAL;
  return ASSASSIN;
};

const teamLabel = (t: TajniAgentiTeam): string =>
  t === 'red' ? 'Crveni' : 'Plavi';

export default function TajniAgentiHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevRevealedCountRef = useRef<number>(0);

  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.phase;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'turn-results') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }
    const cards = (gameState.data.cards as TajniAgentiPublicCard[]) ?? [];
    const revealed = cards.filter((c) => c.revealed).length;
    if (revealed > prevRevealedCountRef.current) {
      play('tick');
    }
    prevRevealedCountRef.current = revealed;
  }, [gameState, play]);

  if (!gameState) return null;
  const { phase, data, timeRemaining } = gameState;
  const cards = (data.cards as TajniAgentiPublicCard[]) ?? [];
  const currentTeam = data.currentTeam as TajniAgentiTeam;
  const redRemaining = (data.redRemaining as number) ?? 0;
  const blueRemaining = (data.blueRemaining as number) ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '1.5rem',
        width: '100%',
        maxWidth: '1100px',
      }}
    >
      <TopBanner
        phase={phase}
        currentTeam={currentTeam}
        redRemaining={redRemaining}
        blueRemaining={blueRemaining}
        timeRemaining={timeRemaining}
        clue={data.currentClue as TajniAgentiClue | undefined}
        guessesRemaining={data.guessesRemaining as number | undefined}
      />

      {phase === 'team-selection' && data.rosters != null && (
        <TeamSelectionView
          rosters={data.rosters as TajniAgentiPublicRosters}
          players={players}
          isScenarioMode={Boolean(data.isScenarioMode)}
        />
      )}

      {phase !== 'team-selection' && (
        <BoardGrid cards={cards} />
      )}

      {phase === 'turn-results' && data.turnResults != null && (
        <TurnResultsView
          results={data.turnResults as TajniAgentiTurnResultsData}
        />
      )}

      {phase === 'ended' && data.ended != null && (
        <EndedView ended={data.ended as TajniAgentiEndedData} />
      )}
    </div>
  );
}

interface TopBannerProps {
  phase: string;
  currentTeam: TajniAgentiTeam;
  redRemaining: number;
  blueRemaining: number;
  timeRemaining: number;
  clue: TajniAgentiClue | undefined;
  guessesRemaining: number | undefined;
}

function TopBanner({
  phase,
  currentTeam,
  redRemaining,
  blueRemaining,
  timeRemaining,
  clue,
  guessesRemaining,
}: TopBannerProps) {
  const phaseText =
    phase === 'team-selection'
      ? 'Izbor timova'
      : phase === 'clue-giving'
        ? `${teamLabel(currentTeam)} špijun bira šifru…`
        : phase === 'guessing'
          ? `${teamLabel(currentTeam)} pogađa`
          : phase === 'turn-results'
            ? 'Rezultati poteza'
            : phase === 'ended'
              ? 'Kraj igre'
              : '';

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <TeamScore color={TEAM_RED} label="Crveni" remaining={redRemaining} />
        <TeamScore color={TEAM_BLUE} label="Plavi" remaining={blueRemaining} />
      </div>
      <div
        style={{
          textAlign: 'center',
          flex: '1 1 auto',
          minWidth: '200px',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '1.1rem',
            color: 'var(--text-secondary)',
          }}
        >
          {phaseText}
        </p>
        {phase === 'guessing' && clue && (
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: '1.6rem',
              fontWeight: 800,
              color: teamColor(clue.team),
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {clue.word} · {clue.count}
            {typeof guessesRemaining === 'number' && (
              <span
                style={{
                  marginLeft: '0.75rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'none',
                  letterSpacing: 0,
                }}
              >
                ostalo: {guessesRemaining}
              </span>
            )}
          </p>
        )}
      </div>
      <div
        style={{
          minWidth: '90px',
          textAlign: 'right',
          fontSize: '1.4rem',
          fontWeight: 700,
          color:
            timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {timeRemaining}s
      </div>
    </div>
  );
}

function TeamScore({
  color,
  label,
  remaining,
}: {
  color: string;
  label: string;
  remaining: number;
}) {
  return (
    <div
      style={{
        padding: '0.5rem 0.85rem',
        borderRadius: '0.6rem',
        background: color,
        color: '#fff',
        fontWeight: 700,
        fontSize: '1rem',
        minWidth: '90px',
        textAlign: 'center',
      }}
    >
      {label}
      <div style={{ fontSize: '1.4rem' }}>{remaining}</div>
    </div>
  );
}

function BoardGrid({ cards }: { cards: TajniAgentiPublicCard[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '0.6rem',
        width: '100%',
        aspectRatio: '5 / 4',
      }}
    >
      {cards.map((card) => (
        <BoardCard key={card.id} card={card} />
      ))}
    </div>
  );
}

function BoardCard({ card }: { card: TajniAgentiPublicCard }) {
  const revealedColor = card.revealed && card.type ? teamColor(card.type) : null;
  const isAssassin = card.revealed && card.type === 'assassin';
  return (
    <motion.div
      initial={false}
      animate={{
        scale: card.revealed ? 1 : 1,
        backgroundColor: revealedColor ?? '#f3eedd',
      }}
      transition={{ duration: 0.3 }}
      style={{
        borderRadius: '0.65rem',
        padding: '0.4rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontWeight: 700,
        color: card.revealed
          ? isAssassin
            ? 'var(--danger)'
            : '#fff'
          : '#2b2412',
        fontSize: '1.1rem',
        lineHeight: 1.1,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        boxShadow: card.revealed
          ? 'inset 0 0 0 3px rgba(0,0,0,0.18)'
          : '0 2px 0 rgba(0,0,0,0.25)',
        wordBreak: 'break-word',
        userSelect: 'none',
      }}
    >
      {card.word}
    </motion.div>
  );
}

interface TeamSelectionViewProps {
  rosters: TajniAgentiPublicRosters;
  players: { id: string; name: string; avatarColor: string; avatarEmoji: string }[];
  isScenarioMode: boolean;
}

function TeamSelectionView({
  rosters,
  players,
  isScenarioMode,
}: TeamSelectionViewProps) {
  const playerName = (id: string) =>
    players.find((p) => p.id === id)?.name ?? '?';
  const playerColor = (id: string) =>
    players.find((p) => p.id === id)?.avatarColor ?? '#888';
  const playerEmoji = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '';

  const handleStart = () => {
    if (!rosters.readyToStart) return;
    socket.emit('host:game-action', {
      action: 'tajni-agenti:start-round',
      data: {},
    });
  };
  const handleBalance = () => {
    socket.emit('host:game-action', {
      action: 'tajni-agenti:auto-balance',
      data: {},
    });
  };

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <p
        style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        {isScenarioMode
          ? 'Igrači biraju tim na svojim telefonima. Tema scenarija je vaša šifra — nema špijuna.'
          : 'Igrači biraju tim na svojim telefonima. Po jedan špijun po timu.'}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
        }}
      >
        <TeamRoster
          color={TEAM_RED}
          label="Crveni"
          playerIds={rosters.red.playerIds}
          spymasterId={isScenarioMode ? null : rosters.red.spymasterId}
          playerName={playerName}
          playerColor={playerColor}
          playerEmoji={playerEmoji}
        />
        <TeamRoster
          color={TEAM_BLUE}
          label="Plavi"
          playerIds={rosters.blue.playerIds}
          spymasterId={isScenarioMode ? null : rosters.blue.spymasterId}
          playerName={playerName}
          playerColor={playerColor}
          playerEmoji={playerEmoji}
        />
      </div>

      {rosters.unassignedPlayerIds.length > 0 && (
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '0.6rem',
            padding: '0.75rem',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: 'var(--text-secondary)',
            }}
          >
            Bez tima:{' '}
            {rosters.unassignedPlayerIds.map(playerName).join(', ')}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
        <button
          onClick={handleBalance}
          style={{
            padding: '0.65rem 1.2rem',
            fontSize: '1rem',
            borderRadius: '0.6rem',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--text-secondary)',
          }}
        >
          Pomiri timove
        </button>
        <button
          onClick={handleStart}
          disabled={!rosters.readyToStart}
          style={{
            padding: '0.65rem 1.4rem',
            fontSize: '1rem',
            borderRadius: '0.6rem',
            fontWeight: 700,
            background: rosters.readyToStart ? 'var(--accent)' : 'var(--bg-secondary)',
            color: '#fff',
            opacity: rosters.readyToStart ? 1 : 0.5,
            cursor: rosters.readyToStart ? 'pointer' : 'not-allowed',
          }}
        >
          Počni rundu
        </button>
      </div>

      {rosters.rosterIssue && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--danger)',
            fontSize: '0.9rem',
            margin: 0,
          }}
        >
          {rosters.rosterIssue}
        </p>
      )}
    </div>
  );
}

function TeamRoster({
  color,
  label,
  playerIds,
  spymasterId,
  playerName,
  playerColor,
  playerEmoji,
}: {
  color: string;
  label: string;
  playerIds: string[];
  spymasterId: string | null;
  playerName: (id: string) => string;
  playerColor: (id: string) => string;
  playerEmoji: (id: string) => string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderTop: `4px solid ${color}`,
        borderRadius: '0.6rem',
        padding: '0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, color }}>
        {label} tim ({playerIds.length})
      </p>
      {playerIds.length === 0 && (
        <p
          style={{
            margin: 0,
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
          }}
        >
          (prazno)
        </p>
      )}
      {playerIds.map((id) => (
        <div
          key={id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.3rem 0.5rem',
            background: 'var(--bg-secondary)',
            borderRadius: '0.4rem',
            borderLeft: `3px solid ${playerColor(id)}`,
          }}
        >
          <span style={{ flex: 1, fontSize: '0.95rem' }}>
            {playerEmoji(id)} {playerName(id)}
          </span>
          {spymasterId === id && (
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              ŠPIJUN
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function TurnResultsView({ results }: { results: TajniAgentiTurnResultsData }) {
  const reasonText: Record<TajniAgentiTurnResultsData['endReason'], string> = {
    'wrong-team': 'Pogrešan tim — kraj poteza.',
    neutral: 'Neutralna karta — kraj poteza.',
    assassin: 'UBICA! Igra je gotova.',
    'count-reached': 'Tim je iskoristio sve pogađanja.',
    'ended-early': 'Tim je završio potez ranije.',
    timeout: 'Vreme je isteklo.',
  };
  return (
    <AnimatePresence>
      <motion.div
        key="turn-results"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        style={{
          width: '100%',
          background: 'var(--bg-card)',
          borderTop: `4px solid ${teamColor(results.team)}`,
          borderRadius: '0.6rem',
          padding: '0.85rem 1rem',
        }}
      >
        <p
          style={{
            margin: 0,
            fontWeight: 700,
            color: teamColor(results.team),
          }}
        >
          {teamLabel(results.team)} tim — {reasonText[results.endReason]}
        </p>
        {results.clue && (
          <p
            style={{
              margin: '0.3rem 0 0',
              fontSize: '0.95rem',
              color: 'var(--text-secondary)',
            }}
          >
            Šifra: <strong>{results.clue.word.toUpperCase()}</strong> ·{' '}
            {results.clue.count}
          </p>
        )}
        {results.log.length > 0 && (
          <ul
            style={{
              margin: '0.5rem 0 0',
              paddingLeft: '1.2rem',
              fontSize: '0.9rem',
            }}
          >
            {results.log.map((entry, i) => (
              <li key={i} style={{ color: teamColor(entry.revealedType) }}>
                <strong>{entry.word.toUpperCase()}</strong> — {entry.guesserName}
              </li>
            ))}
          </ul>
        )}
        {results.nextTeam && (
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: '0.95rem',
              color: 'var(--text-secondary)',
            }}
          >
            Sledeći potez:{' '}
            <strong style={{ color: teamColor(results.nextTeam) }}>
              {teamLabel(results.nextTeam)} tim
            </strong>
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function EndedView({ ended }: { ended: TajniAgentiEndedData }) {
  const reasonText: Record<TajniAgentiEndedData['reason'], string> = {
    'all-found': 'Otkrili su sve svoje agente!',
    assassin: 'Protivnik je dirnuo ubicu.',
    'opponent-finished': 'Protivnik je otkrio njihovog poslednjeg agenta.',
  };
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        width: '100%',
        padding: '1.5rem',
        background: teamColor(ended.winner),
        color: '#fff',
        borderRadius: '0.8rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: '1.2rem', opacity: 0.85 }}>POBEDA</p>
      <p
        style={{
          margin: '0.3rem 0',
          fontSize: '2.4rem',
          fontWeight: 800,
          letterSpacing: '0.05em',
        }}
      >
        {teamLabel(ended.winner).toUpperCase()} TIM
      </p>
      <p style={{ margin: 0, fontSize: '1rem' }}>{reasonText[ended.reason]}</p>
    </motion.div>
  );
}
