import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { WaitingScreen } from '../fibbage/components/WaitingScreen';
import { UpfrontStepper } from './components/UpfrontStepper';
import { SubjectPicker } from './components/SubjectPicker';
import { GuessButtons } from './components/GuessButtons';
import { RoundResult } from './components/RoundResult';
import type {
  KoSamJaPublicOption,
  KoSamJaUpfrontQuestion,
  KoSamJaLeaderboardEntry,
} from '@igra/shared';

export default function KoSamJaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

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
    return (
      <GuessButtons
        options={options}
        hasGuessed={myData?.hasGuessed ?? false}
        selectedOptionId={myData?.selectedOptionId ?? null}
      />
    );
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
