import { useState, useEffect } from 'react';
import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { PhotoFrame } from '../../components/PhotoFrame';
import { AnswerButtons } from './components/AnswerButtons';
import { WaitingForResults } from './components/WaitingForResults';
import { RoundResult } from './components/RoundResult';
import { MapPinPicker } from './components/MapPinPicker';
import { BrojSlider } from './components/BrojSlider';
import { GeoMap } from './components/GeoMap';
import { PixelatedImage } from './components/PixelatedImage';
import { RedosledPicker } from './components/RedosledPicker';
import { ReportRateButton } from './components/ReportRateButton';
import type { MapMarker } from './components/GeoMap';
import { formatBrojValue } from '@igra/shared';
import type {
  GeoPin,
  KvizBrojRoundResult,
  KvizEmojiRoundResult,
  KvizGeoRoundResult,
  KvizQuestionType,
  KvizRedosledRoundResult,
  KvizTextRoundResult,
  KvizValueType,
  KvizVideoRef,
  QuizLeaderboardEntry,
  QuizOption,
  QuizResultData,
} from '@igra/shared';

interface MyAnsweringData {
  hasAnswered?: boolean;
  selectedIndex?: number | null;
  ownPin?: GeoPin;
  ownGuess?: number;
}

interface MyResultData {
  ownDistance?: number | null;
  ownPoints?: number;
  ownGuess?: number;
  wasExact?: boolean;
}

// Outer wrapper: renders the phase UI plus the always-available report/rate
// corner control while a specific question is on screen (answering / results).
export default function QuizGameController() {
  const gameState = useGameStore((s) => s.gameState);
  const phase = gameState?.phase;
  const questionId = gameState?.data?.questionId as string | undefined;
  const showReport =
    !!questionId && (phase === 'answering' || phase === 'showing-results');
  return (
    <>
      <QuizGameControllerInner />
      {showReport && <ReportRateButton questionId={questionId!} />}
    </>
  );
}

function QuizGameControllerInner() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const myColor = usePlayerStore((s) => s.player?.avatarColor);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const questionType = ((data.questionType as KvizQuestionType) ?? 'obicno');
  const myData = playerData[playerId] as MyAnsweringData | undefined;
  const questionText = data.questionText as string | undefined;
  const imageUrl = data.imageUrl as string | undefined;

  // Hostless audio/video: the phone is the only screen, so it also plays the
  // media. One stable branch across showing-question → answering so the clip
  // doesn't restart at the phase flip.
  if (
    hostless &&
    (questionType === 'audio' || questionType === 'video') &&
    (phase === 'showing-question' || phase === 'answering')
  ) {
    const options = data.options as QuizOption[] | undefined;
    const hasAnswered = myData?.hasAnswered ?? false;
    const selectedIndex = myData?.selectedIndex ?? null;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '0.75rem',
          gap: '0.75rem',
        }}
      >
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <QuestionHeader data={data} />
          {questionText && <QuestionCard text={questionText} compact />}
        </div>
        <PhoneMedia
          key={data.questionIndex as number}
          audioUrl={data.audioUrl as string | undefined}
          video={data.video as KvizVideoRef | undefined}
        />
        {phase === 'answering' && (
          <AnswerCountdown
            timeRemaining={timeRemaining}
            timeLimit={data.timeLimit as number | undefined}
          />
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          {phase === 'showing-question' ? (
            <Centered>
              <CountdownRing
                timeRemaining={timeRemaining}
                duration={(data.previewDuration as number) || 5}
              />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                Odgovori se pojavljuju za...
              </p>
            </Centered>
          ) : hasAnswered && selectedIndex !== null && options ? (
            <WaitingForResults
              selectedIndex={selectedIndex}
              optionColor={
                options.find((o) => o.index === selectedIndex)?.color ??
                'var(--accent)'
              }
            />
          ) : options ? (
            <AnswerButtons
              options={options}
              hasAnswered={hasAnswered}
              selectedIndex={selectedIndex}
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === 'showing-question') {
    const previewDuration = (data.previewDuration as number) || 5;
    // Hostless geo: the phone is the only screen showing the round photo.
    if (hostless && questionType === 'geo' && imageUrl) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '0.75rem',
            gap: '0.75rem',
          }}
        >
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <QuestionHeader data={data} />
            {questionText && <QuestionCard text={questionText} compact />}
          </div>
          <PhotoFrame imageUrl={imageUrl} />
          <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <CountdownRing timeRemaining={timeRemaining} duration={previewDuration} />
          </div>
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
          gap: '1.25rem',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <QuestionHeader data={data} />
        {questionText && <QuestionCard text={questionText} />}
        {/* piksel renders its own (pixelated) canvas below — never the sharp image. */}
        {imageUrl && questionType !== 'geo' && questionType !== 'piksel' && (
          <QuestionImage src={imageUrl} />
        )}
        {questionType === 'geo' && imageUrl && <QuestionImage src={imageUrl} />}
        {questionType === 'emoji' && data.emojis != null && (
          <>
            <p style={{ fontSize: '3.4rem', lineHeight: 1.2, margin: 0 }}>
              {data.emojis as string}
            </p>
            {data.emojiCategory != null && (
              <CategoryChip label={data.emojiCategory as string} />
            )}
          </>
        )}
        {questionType === 'dopuna' && data.quote != null && (
          <p
            className="display"
            style={{ fontSize: '1.2rem', fontWeight: 700, lineHeight: 1.3, margin: 0 }}
          >
            „{data.quote as string}{' '}
            <span style={{ color: 'var(--accent)' }}>______</span>"
          </p>
        )}
        {questionType === 'piksel' && imageUrl && (
          <PixelatedImage src={imageUrl} pixelation={1} />
        )}
        {questionType === 'redosled' && Array.isArray(data.items) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center' }}>
            {(data.items as string[]).map((it, i) => (
              <span
                key={i}
                style={{
                  padding: '0.3rem 0.6rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                {it}
              </span>
            ))}
          </div>
        )}
        <CountdownRing timeRemaining={timeRemaining} duration={previewDuration} />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          {questionType === 'geo'
            ? 'Mapa se pojavljuje za...'
            : questionType === 'broj'
              ? 'Klizač se pojavljuje za...'
              : questionType === 'emoji' ||
                  questionType === 'dopuna' ||
                  questionType === 'piksel' ||
                  questionType === 'anagram'
                ? 'Kucanje počinje za...'
                : questionType === 'redosled'
                  ? 'Ređanje počinje za...'
                  : 'Odgovori se pojavljuju za...'}
        </p>
      </div>
    );
  }

  if (phase === 'answering') {
    if (questionType === 'geo') {
      return (
        <MapPinPicker
          timeRemaining={timeRemaining}
          hasLocked={myData?.hasAnswered ?? false}
          ownPin={myData?.ownPin}
          ownColor={myColor}
          photoUrl={imageUrl}
          prompt={questionText}
          mapImageUrl={data.mapImageUrl as string | undefined}
        />
      );
    }

    if (questionType === 'broj') {
      if (myData?.hasAnswered) {
        const unit = data.unit as string | undefined;
        const valueType = data.valueType as KvizValueType | undefined;
        return (
          <Centered>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
              Zaključao si odgovor
            </p>
            <p style={{ fontSize: '3rem', fontWeight: 800 }}>
              {myData.ownGuess != null
                ? formatBrojValue(myData.ownGuess, unit, valueType)
                : '—'}
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {(data.answeredCount as number) ?? 0}/{(data.totalPlayers as number) ?? 0}{' '}
              zaključalo
            </p>
          </Centered>
        );
      }
      return (
        <BrojSlider
          key={data.questionIndex as number}
          prompt={questionText ?? ''}
          emoji={data.emoji as string | undefined}
          imageUrl={imageUrl}
          min={(data.min as number) ?? 0}
          max={(data.max as number) ?? 100}
          step={data.step as number | undefined}
          unit={data.unit as string | undefined}
          valueType={data.valueType as KvizValueType | undefined}
          timeRemaining={timeRemaining}
        />
      );
    }

    if (questionType === 'emoji') {
      const emojiMy = playerData[playerId] as
        | { hasAnswered?: boolean; ownGuess?: string | null; lastWrong?: string | null; ownPoints?: number }
        | undefined;
      return (
        <TextAnswerScreen
          key={data.questionIndex as number}
          visual={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <p style={{ fontSize: '2.8rem', lineHeight: 1.2, margin: 0, textAlign: 'center' }}>
                {(data.emojis as string) ?? ''}
              </p>
              {data.emojiCategory != null && (
                <CategoryChip label={data.emojiCategory as string} />
              )}
            </div>
          }
          hint={hostless ? ((data.hint as string) ?? '') : ''}
          questionText={questionText}
          timeRemaining={timeRemaining}
          hasSolved={emojiMy?.hasAnswered ?? false}
          lastWrong={emojiMy?.lastWrong ?? null}
          ownPoints={emojiMy?.ownPoints ?? 0}
          headerData={data}
        />
      );
    }

    if (
      questionType === 'dopuna' ||
      questionType === 'piksel' ||
      questionType === 'anagram'
    ) {
      const textMy = playerData[playerId] as
        | { hasAnswered?: boolean; ownGuess?: string | null; lastWrong?: string | null; ownPoints?: number }
        | undefined;
      const timeLimit = (data.timeLimit as number) || 20;
      const visual =
        questionType === 'dopuna' ? (
          <p
            className="display"
            style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.3, margin: 0, textAlign: 'center' }}
          >
            „{data.quote as string}{' '}
            <span style={{ color: 'var(--accent)', letterSpacing: '0.06em' }}>______</span>"
          </p>
        ) : questionType === 'piksel' ? (
          <PixelatedImage
            src={imageUrl ?? ''}
            pixelation={Math.max(0, Math.min(1, timeRemaining / timeLimit))}
          />
        ) : (
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '0.14em',
              fontFamily: 'monospace',
              color: 'var(--accent)',
              textAlign: 'center',
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {(data.scramble as string) ?? ''}
          </p>
        );
      return (
        <TextAnswerScreen
          key={data.questionIndex as number}
          visual={visual}
          hint=""
          questionText={questionText}
          timeRemaining={timeRemaining}
          hasSolved={textMy?.hasAnswered ?? false}
          lastWrong={textMy?.lastWrong ?? null}
          ownPoints={textMy?.ownPoints ?? 0}
          headerData={data}
          placeholder={questionType === 'dopuna' ? 'Reč koja nedostaje…' : 'Tvoj odgovor…'}
        />
      );
    }

    if (questionType === 'redosled') {
      const items = (data.items as string[]) ?? [];
      if (myData?.hasAnswered) {
        return (
          <Centered>
            <p style={{ fontSize: '2.4rem', margin: 0 }}>✅</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
              Redosled zaključan!
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              {(data.answeredCount as number) ?? 0}/{(data.totalPlayers as number) ?? 0}{' '}
              zaključalo
            </p>
          </Centered>
        );
      }
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '0.75rem',
            gap: '0.6rem',
          }}
        >
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <QuestionHeader data={data} />
            {questionText && <QuestionCard text={questionText} compact />}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <RedosledPicker
              key={data.questionIndex as number}
              items={items}
              timeRemaining={timeRemaining}
            />
          </div>
        </div>
      );
    }

    const options = data.options as QuizOption[];
    const hasAnswered = myData?.hasAnswered ?? false;
    const selectedIndex = myData?.selectedIndex ?? null;

    const body =
      hasAnswered && selectedIndex !== null ? (
        <WaitingForResults
          selectedIndex={selectedIndex}
          optionColor={
            options.find((o) => o.index === selectedIndex)?.color ??
            'var(--accent)'
          }
        />
      ) : (
        <AnswerButtons
          options={options}
          hasAnswered={hasAnswered}
          selectedIndex={selectedIndex}
        />
      );

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '0.75rem',
          gap: '0.75rem',
        }}
      >
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <QuestionHeader data={data} />
          {questionText && <QuestionCard text={questionText} compact />}
          {imageUrl && <QuestionImage src={imageUrl} compact />}
        </div>
        <AnswerCountdown
          timeRemaining={timeRemaining}
          timeLimit={data.timeLimit as number | undefined}
        />
        <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
      </div>
    );
  }

  if (phase === 'showing-results' && data.geoResult) {
    return (
      <GeoResultView
        result={data.geoResult as KvizGeoRoundResult}
        my={playerData[playerId] as MyResultData | undefined}
        playerId={playerId}
        hostless={hostless}
      />
    );
  }

  if (phase === 'showing-results' && data.brojResult) {
    return (
      <BrojResultView
        result={data.brojResult as KvizBrojRoundResult}
        my={playerData[playerId] as MyResultData | undefined}
        playerId={playerId}
      />
    );
  }

  if (phase === 'showing-results' && data.emojiResult) {
    const emojiMy = playerData[playerId] as
      | { ownPoints?: number; hasSolved?: boolean; ownGuess?: string | null }
      | undefined;
    return (
      <EmojiResultView
        result={data.emojiResult as KvizEmojiRoundResult}
        my={emojiMy}
        playerId={playerId}
      />
    );
  }

  if (phase === 'showing-results' && data.textResult) {
    const textMy = playerData[playerId] as
      | { ownPoints?: number; hasSolved?: boolean; ownGuess?: string | null }
      | undefined;
    return (
      <TextResultView
        result={data.textResult as KvizTextRoundResult}
        my={textMy}
        playerId={playerId}
      />
    );
  }

  if (phase === 'showing-results' && data.redosledResult) {
    const redMy = playerData[playerId] as
      | { ownPoints?: number; ownAccuracy?: number | null }
      | undefined;
    return (
      <RedosledResultView
        result={data.redosledResult as KvizRedosledRoundResult}
        my={redMy}
        playerId={playerId}
      />
    );
  }

  if (phase === 'showing-results' && data.results) {
    return <RoundResult results={data.results as QuizResultData} />;
  }

  if ((phase === 'leaderboard' || phase === 'ended') && data.leaderboard) {
    const leaderboard = data.leaderboard as QuizLeaderboardEntry[];
    const myEntry = leaderboard.find((e) => e.playerId === playerId);

    // Hostless room: no TV showing the standings, so render the full
    // leaderboard on the phone instead of just the player's own rank.
    if (hostless) {
      return (
        <HostlessLeaderboard
          title={phase === 'ended' ? 'Konačni poredak' : 'Rang lista'}
          entries={leaderboard}
          myPlayerId={playerId}
        />
      );
    }

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
            <p
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                margin: 0,
              }}
            >
              {phase === 'ended' ? 'Konačno mesto' : 'Tvoje mesto'}
            </p>
            <p
              className="display text-grad"
              style={{
                fontSize: '3rem',
                fontWeight: 700,
                animation: 'igra-pop .5s',
                margin: 0,
              }}
            >
              #{myEntry.rank}
            </p>
            <p
              className="display"
              style={{ fontSize: '1.3rem', fontWeight: 600, margin: 0 }}
            >
              {myEntry.score.toLocaleString()}{' '}
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>poena</span>
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

// --- geo / broj result screens ----------------------------------------------

function GeoResultView({
  result,
  my,
  playerId,
  hostless,
}: {
  result: KvizGeoRoundResult;
  my?: MyResultData;
  playerId: string;
  hostless: boolean;
}) {
  const km = my?.ownDistance;
  const pts = my?.ownPoints ?? 0;

  const markers: MapMarker[] = [
    ...result.results
      .filter((r) => r.pin !== null)
      .map((r) => ({
        x: (r.pin as GeoPin).x,
        y: (r.pin as GeoPin).y,
        color: r.avatarColor,
      })),
    { x: result.truePin.x, y: result.truePin.y, color: '#F2CE74', isTrue: true },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1rem',
        gap: '0.75rem',
        overflowY: 'auto',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {result.caption && (
          <p style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.3rem' }}>
            {result.caption}
          </p>
        )}
        {km === null || km === undefined ? (
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Nisi postavio pin
          </p>
        ) : (
          <p style={{ fontSize: '1rem', margin: 0 }}>
            {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} od cilja
            {' · '}
            <strong style={{ color: pts > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
              +{pts}
            </strong>
          </p>
        )}
      </div>

      {hostless && (
        <GeoMap
          markers={markers}
          disabled
          maxHeightCss="46dvh"
          mapImageUrl={result.mapImageUrl}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {result.results.map((r) => {
          const isMe = r.playerId === playerId;
          return (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.6rem',
                background: isMe ? 'rgba(194,155,71,.16)' : 'var(--bg-secondary)',
                border: `1px solid ${isMe ? 'var(--accent)' : 'transparent'}`,
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: r.avatarColor,
                  flex: 'none',
                }}
              />
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  fontWeight: isMe ? 800 : 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.name}
              </span>
              <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                {r.distanceKm === null
                  ? '—'
                  : r.distanceKm < 1
                    ? `${Math.round(r.distanceKm * 1000)} m`
                    : `${r.distanceKm.toFixed(1)} km`}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  minWidth: '3ch',
                  textAlign: 'right',
                  color: r.roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
                }}
              >
                +{r.roundScore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BrojResultView({
  result,
  my,
  playerId,
}: {
  result: KvizBrojRoundResult;
  my?: MyResultData;
  playerId: string;
}) {
  const fmt = (v: number) => formatBrojValue(v, result.unit, result.valueType);
  const dist = my?.ownDistance;
  const pts = my?.ownPoints ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1rem',
        gap: '0.75rem',
        overflowY: 'auto',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Tačan odgovor
        </p>
        <p
          style={{
            fontSize: '2.6rem',
            fontWeight: 800,
            color: 'var(--accent)',
            margin: '0.1rem 0',
          }}
        >
          {fmt(result.trueValue)}
        </p>
        {dist === null || dist === undefined ? (
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Nisi zaključao odgovor
          </p>
        ) : (
          <p style={{ fontSize: '1rem', margin: 0 }}>
            {my?.wasExact ? 'Pun pogodak! 🎯' : `Promašio si za ${fmt(dist)}`}
            {' · '}
            <strong style={{ color: pts > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
              +{pts}
            </strong>
          </p>
        )}
      </div>

      {result.results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {result.results.map((r) => {
            const isMe = r.playerId === playerId;
            return (
              <div
                key={r.playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.45rem 0.6rem',
                  background: isMe
                    ? 'rgba(194,155,71,.16)'
                    : 'var(--bg-secondary)',
                  border: `1px solid ${isMe ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: '0.5rem',
                  fontSize: '0.85rem',
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: r.avatarColor,
                    flex: 'none',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    fontWeight: isMe ? 800 : 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.name}
                </span>
                <span
                  style={{
                    color: 'var(--text-secondary)',
                    minWidth: '4ch',
                    textAlign: 'right',
                  }}
                >
                  {r.guess != null ? fmt(r.guess) : '—'}
                </span>
                <span
                  style={{
                    color: 'var(--text-secondary)',
                    minWidth: '4ch',
                    textAlign: 'right',
                    fontSize: '0.78rem',
                  }}
                >
                  {r.distance === null ? '' : `±${fmt(r.distance)}`}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    minWidth: '3ch',
                    textAlign: 'right',
                    color:
                      r.roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
                  }}
                >
                  +{r.roundScore}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- emoji answering / result screens ----------------------------------------

// Free-text answer input for emoji/dopuna/piksel/anagram questions. Wrong
// guesses may retry until the clock runs out; a correct one locks the round
// for this player. `visual` is the type-specific prompt (emojis, quote,
// pixelated image, scramble).
function TextAnswerScreen({
  visual,
  hint,
  questionText,
  timeRemaining,
  hasSolved,
  lastWrong,
  ownPoints,
  headerData,
  placeholder = 'Tvoj odgovor…',
}: {
  visual: React.ReactNode;
  hint: string;
  questionText?: string;
  timeRemaining: number;
  hasSolved: boolean;
  lastWrong: string | null;
  ownPoints: number;
  headerData: Record<string, unknown>;
  placeholder?: string;
}) {
  const [text, setText] = useState('');

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    socket.emit('game:player-action', { action: 'quiz:text', data: { text: v } });
    setText('');
  };

  if (hasSolved) {
    return (
      <Centered>
        <p style={{ fontSize: '2.6rem', margin: 0 }}>✅</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Pogodak!</p>
        <p style={{ fontSize: '1rem', color: 'var(--success)', fontWeight: 800, margin: 0 }}>
          +{ownPoints}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          Čekamo ostale...
        </p>
      </Centered>
    );
  }

  const wrong = lastWrong;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '0.75rem',
        gap: '0.75rem',
      }}
    >
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <QuestionHeader data={headerData} />
        {questionText && <QuestionCard text={questionText} compact />}
      </div>
      {visual}
      {hint && (
        <p
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'var(--accent)',
            fontFamily: 'monospace',
            textAlign: 'center',
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}
        >
          {hint}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={placeholder}
          autoFocus
          style={{
            flex: 1,
            padding: '0.6rem 0.8rem',
            fontWeight: 700,
            borderRadius: '12px',
            border: '1.5px solid var(--line2)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="btn-primary"
          style={{ minWidth: '84px', minHeight: '48px', fontSize: '0.95rem' }}
        >
          Pošalji
        </button>
      </div>
      {wrong && (
        <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center', margin: 0 }}>
          „{wrong}" nije to — probaj opet!
        </p>
      )}
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        {Math.ceil(timeRemaining)}s
      </p>
    </div>
  );
}

function EmojiResultView({
  result,
  my,
  playerId,
}: {
  result: KvizEmojiRoundResult;
  my?: { ownPoints?: number; hasSolved?: boolean };
  playerId: string;
}) {
  const pts = my?.ownPoints ?? 0;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1rem',
        gap: '0.75rem',
        overflowY: 'auto',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {result.category && (
          <div style={{ marginBottom: '0.4rem' }}>
            <CategoryChip label={result.category} />
          </div>
        )}
        <p style={{ fontSize: '2.2rem', margin: 0 }}>{result.emojis}</p>
        <p
          style={{
            fontSize: '1.7rem',
            fontWeight: 800,
            color: 'var(--accent)',
            margin: '0.2rem 0',
          }}
        >
          {result.answer}
        </p>
        <p style={{ fontSize: '1rem', margin: 0 }}>
          {my?.hasSolved ? 'Pogodio si! 🎯' : 'Nisi pogodio'}
          {' · '}
          <strong style={{ color: pts > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
            +{pts}
          </strong>
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {result.results.map((r) => {
          const isMe = r.playerId === playerId;
          return (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.6rem',
                background: isMe ? 'rgba(194,155,71,.16)' : 'var(--bg-secondary)',
                border: `1px solid ${isMe ? 'var(--accent)' : 'transparent'}`,
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: r.avatarColor,
                  flex: 'none',
                }}
              />
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  fontWeight: isMe ? 800 : 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.name}
              </span>
              <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontSize: '0.78rem' }}>
                {r.solved
                  ? r.timeMs != null
                    ? `${(r.timeMs / 1000).toFixed(1)}s`
                    : '✓'
                  : '—'}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  minWidth: '3ch',
                  textAlign: 'right',
                  color: r.roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
                }}
              >
                +{r.roundScore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Results for dopuna/piksel/anagram — same list as emoji results, with the
// kind-specific reveal on top.
function TextResultView({
  result,
  my,
  playerId,
}: {
  result: KvizTextRoundResult;
  my?: { ownPoints?: number; hasSolved?: boolean };
  playerId: string;
}) {
  const pts = my?.ownPoints ?? 0;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1rem',
        gap: '0.75rem',
        overflowY: 'auto',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {result.kind === 'dopuna' && result.quote ? (
          <p
            className="display"
            style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3, margin: 0 }}
          >
            „{result.quote}{' '}
            <span style={{ color: 'var(--accent)' }}>{result.answer}</span>"
          </p>
        ) : (
          <>
            {result.kind === 'piksel' && result.imageUrl && (
              <img
                src={result.imageUrl}
                alt=""
                style={{
                  maxWidth: '100%',
                  maxHeight: '26vh',
                  objectFit: 'contain',
                  borderRadius: '12px',
                }}
              />
            )}
            <p
              style={{
                fontSize: '1.7rem',
                fontWeight: 800,
                color: 'var(--accent)',
                margin: '0.2rem 0',
              }}
            >
              {result.answer}
            </p>
          </>
        )}
        <p style={{ fontSize: '1rem', margin: '0.3rem 0 0' }}>
          {my?.hasSolved ? 'Pogodio si! 🎯' : 'Nisi pogodio'}
          {' · '}
          <strong style={{ color: pts > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
            +{pts}
          </strong>
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {result.results.map((r) => {
          const isMe = r.playerId === playerId;
          return (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.6rem',
                background: isMe ? 'rgba(194,155,71,.16)' : 'var(--bg-secondary)',
                border: `1px solid ${isMe ? 'var(--accent)' : 'transparent'}`,
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: r.avatarColor,
                  flex: 'none',
                }}
              />
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  fontWeight: isMe ? 800 : 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.name}
              </span>
              <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontSize: '0.78rem' }}>
                {r.solved
                  ? r.timeMs != null
                    ? `${(r.timeMs / 1000).toFixed(1)}s`
                    : '✓'
                  : '—'}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  minWidth: '3ch',
                  textAlign: 'right',
                  color: r.roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
                }}
              >
                +{r.roundScore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Results for redosled — correct sequence + per-player accuracy list.
function RedosledResultView({
  result,
  my,
  playerId,
}: {
  result: KvizRedosledRoundResult;
  my?: { ownPoints?: number; ownAccuracy?: number | null };
  playerId: string;
}) {
  const pts = my?.ownPoints ?? 0;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1rem',
        gap: '0.75rem',
        overflowY: 'auto',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>{result.text}</p>
        <p style={{ fontSize: '1rem', margin: '0.3rem 0 0' }}>
          {my?.ownAccuracy == null
            ? 'Nisi zaključao redosled'
            : `${my.ownAccuracy}% parova tačno`}
          {' · '}
          <strong style={{ color: pts > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
            +{pts}
          </strong>
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {result.correctItems.map((it, i) => (
          <div
            key={`${i}-${it}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.6rem',
              background: 'var(--bg-secondary)',
              borderRadius: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            <span style={{ color: 'var(--accent)', minWidth: '2ch', fontWeight: 800 }}>
              {i + 1}.
            </span>
            <span>{it}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {result.results.map((r) => {
          const isMe = r.playerId === playerId;
          return (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.6rem',
                background: isMe ? 'rgba(194,155,71,.16)' : 'var(--bg-secondary)',
                border: `1px solid ${isMe ? 'var(--accent)' : 'transparent'}`,
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: r.avatarColor,
                  flex: 'none',
                }}
              />
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  fontWeight: isMe ? 800 : 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.name}
              </span>
              <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontSize: '0.78rem' }}>
                {r.accuracy === null ? '—' : `${r.accuracy}%`}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  minWidth: '3ch',
                  textAlign: 'right',
                  color: r.roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
                }}
              >
                +{r.roundScore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- small shared bits --------------------------------------------------------

function QuestionHeader({ data }: { data: Record<string, unknown> }) {
  return (
    <p
      style={{
        fontSize: '0.72rem',
        fontWeight: 800,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        margin: 0,
        marginBottom: '0.35rem',
      }}
    >
      Pitanje {(data.questionIndex as number) + 1}/{data.totalQuestions as number}
    </p>
  );
}

function QuestionCard({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <p
      className="display card"
      style={{
        fontSize: compact ? '1.1rem' : '1.3rem',
        fontWeight: 600,
        lineHeight: 1.25,
        margin: 0,
        padding: compact ? '0.8rem 1rem' : '1.1rem 1.2rem',
        borderRadius: compact ? '16px' : '18px',
      }}
    >
      {text}
    </p>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
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
        padding: '1rem',
      }}
    >
      {children}
    </div>
  );
}

// Preconnect to YouTube's hosts so the embed's cold-load is a bit faster.
// Idempotent — added once, reused for every video question.
function preconnectYouTube() {
  const hosts = [
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://i.ytimg.com',
    'https://www.google.com',
    'https://googlevideo.com',
  ];
  for (const href of hosts) {
    if (document.head.querySelector(`link[data-yt-preconnect="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = '';
    link.setAttribute('data-yt-preconnect', href);
    document.head.appendChild(link);
  }
}

// Phone-side YouTube player. Mobile browsers refuse autoplay WITH sound, so the
// old embed only ever showed the poster thumbnail ("učita samo sliku"). We
// autoplay MUTED — that IS allowed, so the clip starts immediately — and offer
// a one-tap "unmute" (reloading the iframe with sound inside the tap gesture,
// which browsers do permit).
function PhoneVideo({ video }: { video: KvizVideoRef }) {
  const [muted, setMuted] = useState(true);
  useEffect(preconnectYouTube, []);

  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
    playsinline: '1',
    mute: muted ? '1' : '0',
  });
  if (video.startSeconds !== undefined) params.set('start', String(video.startSeconds));
  if (video.endSeconds !== undefined) params.set('end', String(video.endSeconds));

  return (
    <div
      style={{
        position: 'relative',
        // Cap the height so the answer buttons always fit below. width follows
        // the 16:9 ratio but never exceeds 100%, and the height stays ≤ 30dvh
        // (min() picks whichever constraint binds first). Centered horizontally.
        width: 'min(100%, calc(30dvh * 16 / 9))',
        maxHeight: '30dvh',
        aspectRatio: '16 / 9',
        margin: '0 auto',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#000',
        flexShrink: 0,
      }}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${video.videoId}?${params.toString()}`}
        title="Video pitanje"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
      {muted && (
        <button
          onClick={() => setMuted(false)}
          style={{
            position: 'absolute',
            bottom: '0.6rem',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.45rem 0.9rem',
            borderRadius: '999px',
            border: 'none',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          🔊 Uključi zvuk
        </button>
      )}
    </div>
  );
}

// Phone-side media block for hostless audio/video questions.
function PhoneMedia({ audioUrl, video }: { audioUrl?: string; video?: KvizVideoRef }) {
  if (video) {
    return <PhoneVideo video={video} />;
  }
  if (audioUrl) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '1.6rem' }} aria-hidden>
          🎵
        </span>
        <audio src={audioUrl} controls autoPlay style={{ width: '100%', maxWidth: '280px' }} />
      </div>
    );
  }
  return null;
}

// Question image shown above the answer buttons. `compact` caps the height
// harder during the answering phase so the option grid still fits the screen.
function QuestionImage({ src, compact }: { src: string; compact?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      style={{
        display: 'block',
        margin: '0 auto',
        maxWidth: '100%',
        maxHeight: compact ? '26vh' : '38vh',
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        borderRadius: '14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    />
  );
}

// Slim depleting progress bar + seconds, shown during the answering phase so
// the player always sees how long is left to answer.
function AnswerCountdown({
  timeRemaining,
  timeLimit,
}: {
  timeRemaining: number;
  timeLimit?: number;
}) {
  const total = timeLimit && timeLimit > 0 ? timeLimit : 15;
  const frac = Math.max(0, Math.min(1, timeRemaining / total));
  const urgent = timeRemaining <= 5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 999,
          background: 'var(--bg-card)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${frac * 100}%`,
            height: '100%',
            borderRadius: 999,
            background: urgent ? 'var(--danger)' : 'var(--accent)',
            transition: 'width 0.3s linear, background 0.3s',
          }}
        />
      </div>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 800,
          fontSize: '0.95rem',
          minWidth: '2.6ch',
          textAlign: 'right',
          color: urgent ? 'var(--danger)' : 'var(--text-primary)',
        }}
      >
        {Math.ceil(timeRemaining)}s
      </span>
    </div>
  );
}

// Small pill showing the emoji riddle's answer-category hint (Film, Lokacija…).
function CategoryChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.75rem',
        borderRadius: 999,
        background: 'rgba(194,155,71,0.16)',
        color: 'var(--accent)',
        fontWeight: 800,
        fontSize: '0.8rem',
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

function CountdownRing({
  timeRemaining,
  duration,
}: {
  timeRemaining: number;
  duration: number;
}) {
  const progress = duration > 0 ? Math.max(0, Math.min(1, timeRemaining / duration)) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const isUrgent = timeRemaining <= 2;
  return (
    <svg width="86" height="86" style={{ display: 'block' }}>
      <circle cx="43" cy="43" r={radius} fill="none" stroke="var(--bg-card)" strokeWidth="6" />
      <circle
        cx="43"
        cy="43"
        r={radius}
        fill="none"
        stroke={isUrgent ? 'var(--danger)' : 'var(--accent)'}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        transform="rotate(-90 43 43)"
        style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.3s' }}
      />
      <text
        x="43"
        y="43"
        textAnchor="middle"
        dominantBaseline="central"
        fill={isUrgent ? 'var(--danger)' : 'var(--text-primary)'}
        fontSize="22"
        fontWeight="700"
        fontFamily="monospace"
      >
        {Math.ceil(timeRemaining)}
      </text>
    </svg>
  );
}
