import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { AnswerInput } from './components/AnswerInput';
import { VoteOptions } from './components/VoteOptions';
import { WaitingScreen } from './components/WaitingScreen';
import { RoundResult } from './components/RoundResult';
import type {
  FibbageQuestionPublic,
  FibbageAnswerOptionPublic,
  FibbageResultData,
  FibbageLeaderboardEntry,
} from '@igra/shared';

// Mirrors the module's active-input constants (hardcoded there as gameplay
// balance — only wait durations are admin-tunable).
const WRITING_SECONDS = 30;
const VOTING_SECONDS = 20;

export default function FibbageController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const question = data.question as FibbageQuestionPublic | undefined;

  if (phase === 'showing-question') {
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
          Pitanje {(data.questionIndex as number) + 1}/{data.totalQuestions as number}
        </p>
        {question?.text && (
          <p style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.3, margin: 0 }}>
            {question.text}
          </p>
        )}
        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--cyan)', margin: 0 }}>
          {data.loading === true ? 'Pripremam pitanja…' : 'Smisli laž…'}
        </p>
      </div>
    );
  }

  if (phase === 'writing-answers' && question) {
    const myData = playerData[playerId] as
      | { hasSubmitted: boolean; isAutoFinder: boolean }
      | undefined;

    if (myData?.isAutoFinder) {
      return (
        <WaitingScreen
          message="Znao/la si odgovor!"
          subMessage="Bonus je tvoj — ne moraš da glasaš. Čekamo ostale..."
        />
      );
    }

    if (myData?.hasSubmitted) {
      return (
        <WaitingScreen
          message="Poslato!"
          subMessage="Čekamo ostale..."
        />
      );
    }

    return (
      <AnswerInput
        questionText={question.text}
        timeRemaining={timeRemaining}
        duration={WRITING_SECONDS}
        submittedCount={(data.submittedCount as number) ?? 0}
        totalPlayers={(data.totalPlayers as number) ?? 0}
      />
    );
  }

  if (phase === 'voting') {
    const options = (data.options as FibbageAnswerOptionPublic[]) ?? [];
    const myData = playerData[playerId] as
      | {
          hasVoted: boolean;
          votedOptionId: string | null;
          myFakeOptionId: string | null;
          isAutoFinder: boolean;
          canVote: boolean;
        }
      | undefined;

    // Auto-finders are out of the vote entirely — they already banked the
    // truth bonus, so a ballot would just be a way to pay it twice.
    if (myData?.isAutoFinder || myData?.canVote === false) {
      return (
        <WaitingScreen
          message="Već si pogodio/la!"
          subMessage="Ostali traže tačan odgovor među lažima..."
        />
      );
    }

    const voteBody = (
      <VoteOptions
        options={options}
        hasVoted={myData?.hasVoted ?? false}
        votedOptionId={myData?.votedOptionId ?? null}
        myFakeOptionId={myData?.myFakeOptionId ?? null}
        timeRemaining={timeRemaining}
        duration={VOTING_SECONDS}
        votedCount={(data.votedCount as number) ?? 0}
        totalPlayers={(data.totalPlayers as number) ?? 0}
      />
    );

    // Hostless room: the question lives only on the TV otherwise — show it
    // above the vote options so players know what they're voting on.
    if (hostless && question) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '0.5rem',
          }}
        >
          <p
            style={{
              textAlign: 'center',
              fontSize: '1rem',
              fontWeight: 700,
              lineHeight: 1.3,
              margin: '0.5rem 0.75rem',
            }}
          >
            {question.text}
          </p>
          <div style={{ flex: 1, minHeight: 0 }}>{voteBody}</div>
        </div>
      );
    }

    return voteBody;
  }

  // Hostless room: results and leaderboard phases render one merged screen
  // (real answer + standings with per-round "+N" deltas + who wrote what),
  // so the phase switch doesn't look like a second screen.
  if (
    hostless &&
    (phase === 'showing-results' || phase === 'leaderboard' || phase === 'ended') &&
    data.results &&
    data.leaderboard
  ) {
    return (
      <FibbageMergedResults
        results={data.results as FibbageResultData}
        leaderboard={data.leaderboard as FibbageLeaderboardEntry[]}
        myPlayerId={playerId}
        isFinal={phase === 'ended'}
      />
    );
  }

  if (phase === 'showing-results') {
    const myData = playerData[playerId] as
      | {
          foundTruth: boolean;
          fooledCount: number;
          roundScore: number;
          realAnswer: string;
          wroteLie: boolean;
          truthBonusWithheld: boolean;
          fooledNames: string[];
          myLieText: string | null;
          fooledByNames: string[];
          fooledByText: string | null;
        }
      | undefined;

    if (!myData) return null;

    return (
      <RoundResult
        foundTruth={myData.foundTruth}
        fooledCount={myData.fooledCount}
        roundScore={myData.roundScore}
        realAnswer={myData.realAnswer}
        wroteLie={myData.wroteLie}
        truthBonusWithheld={myData.truthBonusWithheld}
        fooledNames={myData.fooledNames ?? []}
        myLieText={myData.myLieText ?? null}
        fooledByNames={myData.fooledByNames ?? []}
        fooledByText={myData.fooledByText ?? null}
      />
    );
  }

  if ((phase === 'leaderboard' || phase === 'ended') && data.leaderboard) {
    const leaderboard = data.leaderboard as FibbageLeaderboardEntry[];
    const myEntry = leaderboard.find((e) => e.playerId === playerId);

    // TV mode: own rank as the hero, with the full standings underneath so
    // the phone shows everyone's placement too.
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          padding: '1rem',
          gap: '0.25rem',
          overflowY: 'auto',
        }}
      >
        {myEntry && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>
              {phase === 'ended' ? 'Konačno mesto' : 'Tvoje mesto'}
            </p>
            <p
              style={{
                fontSize: '3rem',
                fontWeight: 800,
                color: 'var(--accent)',
                margin: 0,
              }}
            >
              #{myEntry.rank}
            </p>
            <p style={{ fontSize: '1.3rem', fontWeight: 600, margin: 0 }}>
              {myEntry.score.toLocaleString()} poena
            </p>
          </div>
        )}
        <HostlessLeaderboard
          title=""
          entries={leaderboard}
          myPlayerId={playerId}
          embedded
        />
      </div>
    );
  }

  return null;
}

// Hostless one-screen reveal: every option with its author and votes, then
// standings with the round's "+N" beside each total. Mirrors what the TV shows
// (ResultsReveal), because in a hostless room this phone IS the TV.
function FibbageMergedResults({
  results,
  leaderboard,
  myPlayerId,
  isFinal,
}: {
  results: FibbageResultData;
  leaderboard: FibbageLeaderboardEntry[];
  myPlayerId: string;
  isFinal: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '0.6rem',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <p
        style={{
          textAlign: 'center',
          fontSize: '0.72rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        {isFinal ? 'Konačni poredak · Pravi odgovor' : 'Pravi odgovor'}
      </p>
      <p
        className="display"
        style={{
          alignSelf: 'center',
          fontSize: '1.35rem',
          fontWeight: 700,
          color: 'var(--success)',
          background: 'rgba(47,224,138,.14)',
          border: '1px solid var(--success)',
          padding: '0.55rem 1.1rem',
          borderRadius: '14px',
          margin: 0,
          lineHeight: 1.3,
          animation: 'igra-pop .4s',
        }}
      >
        ✓ {results.realAnswer}
      </p>

      {/* Every lie attributed, not just the ones that landed. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {results.revealOptions
          .filter((o) => !o.isReal)
          .map((opt) => (
            <div
              key={opt.id}
              style={{
                padding: '0.55rem 0.8rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                fontSize: '0.85rem',
                lineHeight: 1.45,
                opacity: opt.voterPlayerIds.length > 0 ? 1 : 0.62,
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  color: 'var(--pink)',
                  background: 'rgba(217,123,108,.14)',
                  padding: '2px 8px',
                  borderRadius: '7px',
                  fontSize: '0.78rem',
                }}
              >
                {opt.authorNames.join(', ')} 🤥
              </span>{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                „{opt.text}"
              </span>{' '}
              {opt.voterPlayerIds.length > 0 ? (
                <>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                    nasamario/la:
                  </span>{' '}
                  <strong style={{ color: 'var(--accent)' }}>
                    {opt.voterNames.join(', ')}
                  </strong>{' '}
                  <span style={{ color: 'var(--success)', fontWeight: 800 }}>
                    +{opt.pointsEarned}
                  </span>
                </>
              ) : (
                <span style={{ color: 'var(--dim)', fontWeight: 700 }}>
                  niko nije poverovao
                </span>
              )}
            </div>
          ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {leaderboard.map((entry) => {
          const isMe = entry.playerId === myPlayerId;
          const delta = entry.roundScore ?? 0;
          return (
            <div
              key={entry.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.55rem 0.75rem',
                background: isMe
                  ? 'linear-gradient(90deg, rgba(217,123,108,.14), var(--bg-secondary))'
                  : 'var(--bg-secondary)',
                borderRadius: '12px',
                border: isMe
                  ? '1px solid rgba(217,123,108,.4)'
                  : '1px solid var(--line)',
                fontSize: '0.9rem',
              }}
            >
              <span
                className="display"
                style={{
                  fontWeight: 700,
                  color:
                    entry.rank === 1
                      ? 'var(--amber)'
                      : entry.rank === 2
                        ? '#C9CCE0'
                        : entry.rank === 3
                          ? '#D8916A'
                          : 'var(--dim)',
                  minWidth: '1.4rem',
                  textAlign: 'center',
                }}
              >
                {entry.rank}
              </span>
              <span
                className="avatar-tile"
                style={{ width: '26px', height: '26px', backgroundColor: entry.avatarColor }}
              />
              <span
                style={{
                  flex: 1,
                  fontWeight: 800,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.name}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  color: delta > 0 ? 'var(--success)' : 'var(--dim)',
                  background:
                    delta > 0 ? 'rgba(47,224,138,.15)' : 'rgba(255,255,255,.05)',
                  padding: '2px 7px',
                  borderRadius: '7px',
                }}
              >
                +{delta}
              </span>
              <span
                className="display"
                style={{ fontWeight: 700, minWidth: '3.2rem', textAlign: 'right' }}
              >
                {entry.score.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
