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
  TajniAgentiMode,
  TajniAgentiPublicRosters,
  TajniAgentiTeam,
  TajniAgentiTurnResultsData,
  TajniAgentiEndedData,
} from '@igra/shared';

const TEAM_RED = '#C75146';
const TEAM_BLUE = '#4F80B8';
const NEUTRAL = '#C9B896';
const ASSASSIN = '#0B1728';
const AGENT_GREEN = '#4C9E6B';

const teamColor = (t: TajniAgentiCardType): string => {
  if (t === 'red') return TEAM_RED;
  if (t === 'blue') return TEAM_BLUE;
  if (t === 'neutral') return NEUTRAL;
  if (t === 'agent') return AGENT_GREEN;
  return ASSASSIN;
};

const teamLabel = (t: TajniAgentiTeam): string =>
  t === 'red' ? 'Crveni' : 'Plavi';

const OTHER: Record<TajniAgentiTeam, TajniAgentiTeam> = {
  red: 'blue',
  blue: 'red',
};

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
  const mode = (data.mode as TajniAgentiMode) ?? 'classic';
  const redRemaining = (data.redRemaining as number) ?? 0;
  const blueRemaining = (data.blueRemaining as number) ?? 0;
  const turnsRemaining = (data.turnsRemaining as number) ?? 0;
  const agentsFound = (data.agentsFound as number) ?? 0;
  const agentsTotal = (data.agentsTotal as number) ?? 0;

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
        mode={mode}
        currentTeam={currentTeam}
        redRemaining={redRemaining}
        blueRemaining={blueRemaining}
        turnsRemaining={turnsRemaining}
        agentsFound={agentsFound}
        agentsTotal={agentsTotal}
        timeRemaining={timeRemaining}
        clue={data.currentClue as TajniAgentiClue | undefined}
        guessesRemaining={data.guessesRemaining as number | undefined}
      />

      {phase === 'team-selection' && data.rosters != null && (
        <TeamSelectionView
          rosters={data.rosters as TajniAgentiPublicRosters}
          players={players}
          mode={mode}
        />
      )}

      {phase !== 'team-selection' && (
        <BoardGrid cards={cards} mode={mode} />
      )}

      {phase === 'turn-results' && data.turnResults != null && (
        <TurnResultsView
          results={data.turnResults as TajniAgentiTurnResultsData}
          mode={mode}
        />
      )}

      {phase === 'ended' && data.ended != null && (
        <EndedView ended={data.ended as TajniAgentiEndedData} mode={mode} />
      )}
    </div>
  );
}

interface TopBannerProps {
  phase: string;
  mode: TajniAgentiMode;
  currentTeam: TajniAgentiTeam;
  redRemaining: number;
  blueRemaining: number;
  turnsRemaining: number;
  agentsFound: number;
  agentsTotal: number;
  timeRemaining: number;
  clue: TajniAgentiClue | undefined;
  guessesRemaining: number | undefined;
}

function TopBanner({
  phase,
  mode,
  currentTeam,
  redRemaining,
  blueRemaining,
  turnsRemaining,
  agentsFound,
  agentsTotal,
  timeRemaining,
  clue,
  guessesRemaining,
}: TopBannerProps) {
  const phaseText =
    phase === 'team-selection'
      ? mode === 'coop'
        ? 'Izbor špijuna'
        : 'Izbor timova'
      : phase === 'clue-giving'
        ? mode === 'duet'
          ? `${teamLabel(currentTeam)} smišljaju šifru…`
          : mode === 'coop'
            ? 'Špijun bira šifru…'
            : `${teamLabel(currentTeam)} špijun bira šifru…`
        : phase === 'guessing'
          ? mode === 'duet'
            ? `${teamLabel(OTHER[currentTeam])} pogađaju`
            : mode === 'coop'
              ? 'Tim pogađa'
              : `${teamLabel(currentTeam)} pogađa`
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
        {mode === 'classic' ? (
          <>
            <TeamScore color={TEAM_RED} label="Crveni" remaining={redRemaining} />
            <TeamScore color={TEAM_BLUE} label="Plavi" remaining={blueRemaining} />
          </>
        ) : (
          <>
            <TeamScore
              color={AGENT_GREEN}
              label="Agenti"
              remaining={`${agentsFound}/${agentsTotal}`}
            />
            <TeamScore
              color="#C29B47"
              label={mode === 'duet' ? 'Potezi' : 'Poeni'}
              remaining={turnsRemaining}
            />
          </>
        )}
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
  remaining: number | string;
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

function BoardGrid({
  cards,
  mode,
}: {
  cards: TajniAgentiPublicCard[];
  mode: TajniAgentiMode;
}) {
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
        <BoardCard key={card.id} card={card} mode={mode} />
      ))}
    </div>
  );
}

function BoardCard({
  card,
  mode,
}: {
  card: TajniAgentiPublicCard;
  mode: TajniAgentiMode;
}) {
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
        position: 'relative',
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
      {/* Duet: a bystander marker per side whose clue burned this card. */}
      {mode === 'duet' && !card.revealed && card.bystanderFor && (
        <span
          style={{
            position: 'absolute',
            top: '0.25rem',
            right: '0.35rem',
            display: 'flex',
            gap: '0.2rem',
          }}
        >
          {card.bystanderFor.map((side) => (
            <span
              key={side}
              style={{
                width: '0.7rem',
                height: '0.7rem',
                borderRadius: '50%',
                background: NEUTRAL,
                border: `2px solid ${teamColor(side)}`,
              }}
            />
          ))}
        </span>
      )}
    </motion.div>
  );
}

interface TeamSelectionViewProps {
  rosters: TajniAgentiPublicRosters;
  players: { id: string; name: string; avatarColor: string; avatarEmoji: string }[];
  mode: TajniAgentiMode;
}

function TeamSelectionView({
  rosters,
  players,
  mode,
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
        {mode === 'duet'
          ? 'Igrači biraju stranu na svojim telefonima. Svaka strana vidi svoj tajni ključ i daje šifre drugoj — zajedno tražite 15 agenata za 9 poteza.'
          : mode === 'coop'
            ? 'Svi ste jedan tim. Jedan igrač je špijun (izaberite na telefonu) — ostali pogađaju. Nađite 9 agenata pre nego što potrošite 9 poena.'
            : 'Igrači biraju tim na svojim telefonima. Po jedan špijun po timu.'}
      </p>

      {mode === 'coop' ? (
        <TeamRoster
          color={TEAM_BLUE}
          label="Tim"
          playerIds={rosters.blue.playerIds}
          spymasterId={rosters.blue.spymasterId}
          playerName={playerName}
          playerColor={playerColor}
          playerEmoji={playerEmoji}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
          }}
        >
          <TeamRoster
            color={TEAM_RED}
            label="Crveni tim"
            playerIds={rosters.red.playerIds}
            spymasterId={mode === 'duet' ? null : rosters.red.spymasterId}
            playerName={playerName}
            playerColor={playerColor}
            playerEmoji={playerEmoji}
          />
          <TeamRoster
            color={TEAM_BLUE}
            label="Plavi tim"
            playerIds={rosters.blue.playerIds}
            spymasterId={mode === 'duet' ? null : rosters.blue.spymasterId}
            playerName={playerName}
            playerColor={playerColor}
            playerEmoji={playerEmoji}
          />
        </div>
      )}

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
        {label} ({playerIds.length})
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

function TurnResultsView({
  results,
  mode,
}: {
  results: TajniAgentiTurnResultsData;
  mode: TajniAgentiMode;
}) {
  const reasonText: Record<TajniAgentiTurnResultsData['endReason'], string> = {
    'wrong-team':
      mode === 'coop'
        ? 'Pogrešna boja — izgubljen dodatni poen!'
        : 'Pogrešan tim — kraj poteza.',
    neutral:
      mode === 'duet'
        ? 'Prolaznik — kraj poteza.'
        : 'Neutralna karta — kraj poteza.',
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
        {typeof results.turnsRemaining === 'number' && (
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: '0.95rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
            }}
          >
            {mode === 'duet' ? 'Preostalo poteza' : 'Preostalo poena'}:{' '}
            <strong>{results.turnsRemaining}</strong>
          </p>
        )}
        {results.nextTeam && mode !== 'coop' && (
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: '0.95rem',
              color: 'var(--text-secondary)',
            }}
          >
            {mode === 'duet' ? 'Sledeću šifru daju:' : 'Sledeći potez:'}{' '}
            <strong style={{ color: teamColor(results.nextTeam) }}>
              {teamLabel(results.nextTeam)}
            </strong>
          </p>
        )}
        {results.winner !== undefined && results.winner !== null && (
          <p
            style={{
              margin: '0.6rem 0 0',
              fontSize: '1.4rem',
              fontWeight: 800,
              color:
                results.winner === 'players'
                  ? AGENT_GREEN
                  : teamColor(results.winner),
            }}
          >
            {results.winner === 'players'
              ? '🏆 Pobedili ste!'
              : `🏆 ${teamLabel(results.winner)} tim pobeđuje!`}
          </p>
        )}
        {results.winner === null && results.nextTeam === null && (
          <p
            style={{
              margin: '0.6rem 0 0',
              fontSize: '1.4rem',
              fontWeight: 800,
              color: 'var(--danger)',
            }}
          >
            💀 Poraz…
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function EndedView({
  ended,
  mode,
}: {
  ended: TajniAgentiEndedData;
  mode: TajniAgentiMode;
}) {
  const won = ended.winner !== null;
  const isCoopMode = mode !== 'classic';

  const classicReasonText: Record<TajniAgentiEndedData['reason'], string> = {
    'all-found': 'Otkrili su sve svoje agente!',
    assassin: 'Protivnik je dirnuo ubicu.',
    'opponent-finished': 'Protivnik je otkrio njihovog poslednjeg agenta.',
    'out-of-turns': '',
    abandoned: 'Protivnički tim je ostao bez igrača.',
  };
  const coopReasonText: Record<TajniAgentiEndedData['reason'], string> = {
    'all-found': 'Našli ste sve agente!',
    assassin: 'Dirnuli ste ubicu…',
    'opponent-finished': '',
    'out-of-turns':
      mode === 'duet'
        ? 'Potrošili ste svih 9 poteza.'
        : 'Potrošili ste svih 9 poena.',
    abandoned: 'Nedovoljno igrača za nastavak.',
  };

  const bg = isCoopMode
    ? won
      ? AGENT_GREEN
      : ASSASSIN
    : teamColor(ended.winner as TajniAgentiTeam);

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        width: '100%',
        padding: '1.5rem',
        background: bg,
        color: won ? '#fff' : 'var(--danger)',
        borderRadius: '0.8rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: '1.2rem', opacity: 0.85 }}>
        {won ? 'POBEDA' : 'PORAZ'}
      </p>
      <p
        style={{
          margin: '0.3rem 0',
          fontSize: '2.4rem',
          fontWeight: 800,
          letterSpacing: '0.05em',
        }}
      >
        {isCoopMode
          ? won
            ? 'BRAVO!'
            : 'KRAJ MISIJE'
          : `${teamLabel(ended.winner as TajniAgentiTeam).toUpperCase()} TIM`}
      </p>
      <p style={{ margin: 0, fontSize: '1rem' }}>
        {isCoopMode
          ? coopReasonText[ended.reason]
          : classicReasonText[ended.reason]}
      </p>
      {isCoopMode && typeof ended.agentsFound === 'number' && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '1rem', opacity: 0.9 }}>
          Pronađeno agenata: {ended.agentsFound}/{ended.agentsTotal}
        </p>
      )}
    </motion.div>
  );
}
