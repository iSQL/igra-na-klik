import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { WaitingScreen } from '../fibbage/components/WaitingScreen';
import { UpfrontStepper } from './components/UpfrontStepper';
import { SubjectPicker } from './components/SubjectPicker';
import { GuessButtons } from './components/GuessButtons';
import { RoundResult } from './components/RoundResult';
import type {
  KoSamJaPublicOption,
  KoSamJaUpfrontQuestion,
  KoSamJaResultData,
  KoSamJaLeaderboardEntry,
} from '@igra/shared';

export default function KoSamJaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, data, playerData } = gameState;

  if (phase === 'collecting-upfront') {
    const myData = playerData[playerId] as
      | {
          pendingQuestions: KoSamJaUpfrontQuestion[];
          currentQuestion: KoSamJaUpfrontQuestion | null;
          completedCount: number;
          totalAssigned: number;
          allDone: boolean;
        }
      | undefined;

    if (!myData || myData.totalAssigned === 0) {
      return (
        <WaitingScreen
          message="Nemaš pitanja za sebe"
          subMessage="Čekamo ostale igrače…"
        />
      );
    }

    if (myData.allDone || !myData.currentQuestion) {
      return (
        <WaitingScreen
          message="Gotovo!"
          subMessage="Čekamo ostale da završe…"
        />
      );
    }

    return (
      <UpfrontStepper
        question={myData.currentQuestion}
        completedCount={myData.completedCount}
        totalAssigned={myData.totalAssigned}
      />
    );
  }

  if (phase === 'showing-question') {
    const isSubject =
      (playerData[playerId] as { isSubject?: boolean } | undefined)?.isSubject ??
      false;
    const questionText = data.currentQuestionText as string | undefined;
    const subjectName = data.currentSubjectName as string | undefined;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          {isSubject
            ? 'Pitanje o tebi…'
            : `Pitanje za ${subjectName ?? '?'}…`}
        </p>
        {questionText && (
          <p
            style={{
              fontSize: '1.3rem',
              fontWeight: 700,
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            {questionText}
          </p>
        )}
      </div>
    );
  }

  if (phase === 'subject-picking') {
    const myData = playerData[playerId] as
      | {
          isSubject: boolean;
          peerOptions?: KoSamJaPublicOption[];
          hasPicked?: boolean;
          waitingFor?: string;
        }
      | undefined;

    if (myData?.isSubject) {
      return (
        <SubjectPicker
          questionText={(data.currentQuestionText as string) ?? ''}
          options={myData.peerOptions ?? []}
          hasPicked={myData.hasPicked ?? false}
        />
      );
    }
    return (
      <WaitingScreen
        message={`${myData?.waitingFor ?? 'Igrač'} bira…`}
        subMessage="Pripremamo opcije za pogađanje."
      />
    );
  }

  if (phase === 'guessing') {
    const myData = playerData[playerId] as
      | {
          isSubject: boolean;
          guessedCount?: number;
          totalGuessers?: number;
          hasGuessed?: boolean;
          selectedOptionId?: string | null;
        }
      | undefined;

    if (myData?.isSubject) {
      return (
        <WaitingScreen
          message="Tvoje pitanje!"
          subMessage={`Čekamo druge da pogode (${myData.guessedCount ?? 0}/${
            myData.totalGuessers ?? 0
          })`}
        />
      );
    }

    const options = (data.options as KoSamJaPublicOption[] | undefined) ?? [];
    const guessBody = (
      <GuessButtons
        options={options}
        hasGuessed={myData?.hasGuessed ?? false}
        selectedOptionId={myData?.selectedOptionId ?? null}
      />
    );

    // Hostless room: the question is otherwise only on the TV — show it
    // above the guess buttons so players know what they're guessing.
    if (hostless) {
      const questionText = data.currentQuestionText as string | undefined;
      const subjectName = data.currentSubjectName as string | undefined;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '0.5rem',
          }}
        >
          <div style={{ textAlign: 'center', margin: '0.4rem 0.75rem' }}>
            {subjectName && (
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}
              >
                Pitanje za{' '}
                <strong style={{ color: 'var(--accent)' }}>{subjectName}</strong>
              </p>
            )}
            {questionText && (
              <p
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  lineHeight: 1.3,
                  margin: '0.25rem 0 0',
                }}
              >
                {questionText}
              </p>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>{guessBody}</div>
        </div>
      );
    }

    return guessBody;
  }

  if (phase === 'showing-results') {
    const myData = playerData[playerId] as
      | {
          wasSubject: boolean;
          wasCorrect?: boolean;
          roundScore: number;
          totalScore: number;
          subjectBonus?: number;
          wrongGuessCount?: number;
          skipped?: boolean;
        }
      | undefined;
    if (!myData) return null;

    // Hostless room: append the TV's reveal (correct answer + everyone's
    // guesses) under the player's own result. data.results is public.
    if (hostless && data.results) {
      const results = data.results as KoSamJaResultData;
      const correctText =
        results.options.find((o) => o.id === results.correctOptionId)?.text ??
        '?';
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            gap: '0.6rem',
            padding: '1rem',
            overflowY: 'auto',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            {results.subjectName} — odgovor:
          </p>
          <p
            style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              color: 'var(--success)',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {correctText}
          </p>
          <p style={{ fontSize: '0.95rem', margin: '0.2rem 0' }}>
            {myData.wasSubject ? (
              <>
                Pogrešnih odgovora: {myData.wrongGuessCount ?? 0} ·{' '}
                <strong style={{ color: 'var(--accent)' }}>
                  +{myData.roundScore}
                </strong>
              </>
            ) : (
              <>
                {myData.skipped
                  ? '⏭ Preskočeno'
                  : myData.wasCorrect
                    ? '✅ Tačno!'
                    : '❌ Netačno'}{' '}
                ·{' '}
                <strong style={{ color: 'var(--accent)' }}>
                  +{myData.roundScore}
                </strong>
              </>
            )}
          </p>
          {results.guesses.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                textAlign: 'left',
              }}
            >
              {results.guesses.map((g) => {
                const guessedText = g.optionId
                  ? results.options.find((o) => o.id === g.optionId)?.text
                  : null;
                return (
                  <div
                    key={g.playerId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.45rem 0.7rem',
                      background: 'var(--bg-card)',
                      borderRadius: '0.5rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>{g.correct ? '✅' : '❌'}</span>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <strong>{g.playerName}</strong>
                      {guessedText && (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {' '}
                          — „{guessedText}"
                        </span>
                      )}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                      +{g.roundScore}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <RoundResult
        wasSubject={myData.wasSubject}
        wasCorrect={myData.wasCorrect ?? false}
        roundScore={myData.roundScore}
        totalScore={myData.totalScore}
        subjectBonus={myData.subjectBonus}
        wrongGuessCount={myData.wrongGuessCount}
        skipped={myData.skipped}
      />
    );
  }

  if ((phase === 'leaderboard' || phase === 'ended') && data.leaderboard) {
    const leaderboard = data.leaderboard as KoSamJaLeaderboardEntry[];
    const myEntry = leaderboard.find((e) => e.playerId === playerId);

    if (hostless) {
      return (
        <HostlessLeaderboard
          title={phase === 'ended' ? 'Konačni poredak' : 'Rang lista'}
          entries={leaderboard}
          myPlayerId={playerId}
        />
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
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        {myEntry && (
          <>
            <p
              style={{
                fontSize: '1rem',
                color: 'var(--text-secondary)',
              }}
            >
              {phase === 'ended' ? 'Konačno mesto' : 'Tvoje mesto'}
            </p>
            <p
              style={{
                fontSize: '3rem',
                fontWeight: 800,
                color: 'var(--accent)',
              }}
            >
              #{myEntry.rank}
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {myEntry.score.toLocaleString()} poena
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}
