import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { GameFrame } from '../../components/kit/GameFrame';
import { WaitingPanel, type ProgressPlayer } from '../../components/kit/WaitingPanel';
import { AnswerInput } from './components/AnswerInput';
import { VoteOptions } from './components/VoteOptions';
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
  if (!gameState) return null;
  const { phase, timeRemaining, data } = gameState;

  const round = `Runda ${(data.questionIndex as number) + 1}/${data.totalQuestions as number}`;
  const step: Record<string, string> = {
    'showing-question': data.loading === true ? 'Pripremam pitanja…' : 'Novo pitanje',
    'writing-answers': 'Napiši laž',
    voting: 'Pronađi istinu',
    'showing-results': 'Rezultat',
    leaderboard: 'Rang lista',
  };
  const subtitle = phase === 'ended' ? 'Kraj igre' : `${round} · ${step[phase] ?? ''}`;
  const total =
    phase === 'writing-answers' ? WRITING_SECONDS : phase === 'voting' ? VOTING_SECONDS : undefined;

  return (
    <GameFrame
      gameId="fibbage"
      subtitle={subtitle}
      timeRemaining={total ? timeRemaining : undefined}
      timeTotal={total}
    >
      <FibbagePhaseView />
    </GameFrame>
  );
}

// Who's in, from the broadcast chip lists (booleans only — never the text).
function progressOf(list: unknown): ProgressPlayer[] {
  return ((list as { playerId: string; done: boolean }[] | undefined) ?? []).map((p) => ({
    playerId: p.playerId,
    done: p.done,
  }));
}

function FibbagePhaseView() {
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
        {question?.text && (
          <p
            className="display"
            style={{ fontSize: '1.55rem', fontWeight: 600, lineHeight: 1.2, margin: 0 }}
          >
            {question.text}
          </p>
        )}
        <p style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--amber)', margin: 0 }}>
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
        <WaitingPanel
          hero={<TruthHero />}
          title="Znao/la si odgovor!"
          subtitle="Bonus je tvoj — ne moraš da glasaš."
          progressLabel="Ko je poslao"
          players={progressOf(data.submitters)}
        />
      );
    }

    if (myData?.hasSubmitted) {
      return (
        <WaitingPanel
          hero={
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 36,
                background: 'var(--bg-secondary)',
                border: '2px solid var(--accent)',
                boxShadow: '0 0 0 6px rgba(194,155,71,.18)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '3.2rem',
                animation: 'igra-pop .4s',
              }}
            >
              🤥
            </div>
          }
          title="Laž poslata"
          subtitle="Glasanje počinje kad svi pošalju ili istekne vreme."
          progressLabel="Ko je poslao"
          players={progressOf(data.submitters)}
        />
      );
    }

    return (
      <AnswerInput
        questionText={question.text}
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
        <WaitingPanel
          hero={<TruthHero />}
          title="Već si pogodio/la!"
          subtitle="Ostali traže tačan odgovor među lažima."
          progressLabel="Ko je glasao"
          players={progressOf(data.voters)}
        />
      );
    }

    const voteBody = (
      <VoteOptions
        options={options}
        hasVoted={myData?.hasVoted ?? false}
        votedOptionId={myData?.votedOptionId ?? null}
        myFakeOptionId={myData?.myFakeOptionId ?? null}
        voters={progressOf(data.voters)}
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
            paddingTop: '1rem',
          }}
        >
          <p
            className="display"
            style={{
              textAlign: 'center',
              fontSize: '1.2rem',
              fontWeight: 600,
              lineHeight: 1.25,
              margin: 0,
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
    // TV mode: the pinned "you" card carries your own place.
    return (
      <HostlessLeaderboard
        title={phase === 'ended' ? 'Konačni poredak' : 'Rang lista'}
        entries={data.leaderboard as FibbageLeaderboardEntry[]}
        myPlayerId={playerId}
      />
    );
  }

  return null;
}

function TruthHero() {
  return (
    <div
      style={{
        width: 120,
        height: 120,
        borderRadius: 36,
        background: 'rgba(87,179,128,.14)',
        border: '2px solid var(--success)',
        color: 'var(--success-ink)',
        display: 'grid',
        placeItems: 'center',
        fontSize: '3.4rem',
        fontWeight: 800,
        animation: 'igra-pop .4s',
      }}
    >
      ✓
    </div>
  );
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
        padding: '1rem 0 0.5rem',
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
          color: 'var(--success-ink)',
          background: 'rgba(87,179,128,.14)',
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

      <HostlessLeaderboard
        title=""
        entries={leaderboard}
        myPlayerId={myPlayerId}
        embedded
      />
    </div>
  );
}
