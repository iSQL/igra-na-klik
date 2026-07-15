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
import type { MapMarker } from './components/GeoMap';
import { formatBrojValue } from '@igra/shared';
import type {
  GeoPin,
  KvizBrojRoundResult,
  KvizGeoRoundResult,
  KvizQuestionType,
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

export default function QuizGameController() {
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
        {imageUrl && questionType !== 'geo' && <QuestionImage src={imageUrl} />}
        {questionType === 'geo' && imageUrl && <QuestionImage src={imageUrl} />}
        <CountdownRing timeRemaining={timeRemaining} duration={previewDuration} />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          {questionType === 'geo'
            ? 'Mapa se pojavljuje za...'
            : questionType === 'broj'
              ? 'Klizač se pojavljuje za...'
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
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {phase === 'ended' ? 'Konačno mesto' : 'Tvoje mesto'}
            </p>
            <p
              className="display text-grad"
              style={{ fontSize: '4rem', fontWeight: 700, animation: 'igra-pop .5s' }}
            >
              #{myEntry.rank}
            </p>
            <p className="display" style={{ fontSize: '1.6rem', fontWeight: 600 }}>
              {myEntry.score.toLocaleString()}{' '}
              <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>poena</span>
            </p>
          </>
        )}
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

// Phone-side media block for hostless audio/video questions.
function PhoneMedia({ audioUrl, video }: { audioUrl?: string; video?: KvizVideoRef }) {
  if (video) {
    const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
    if (video.startSeconds !== undefined) params.set('start', String(video.startSeconds));
    if (video.endSeconds !== undefined) params.set('end', String(video.endSeconds));
    return (
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: '12px',
          overflow: 'hidden',
          background: '#000',
          flexShrink: 0,
        }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.videoId}?${params.toString()}`}
          title="Video pitanje"
          allow="autoplay; encrypted-media"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
    );
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
