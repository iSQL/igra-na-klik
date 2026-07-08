import { useEffect, useRef, useState } from 'react';
import {
  GAME_DEFINITIONS,
  GAME_ROUND_CONFIG,
  parseKoSamJaImport,
  parseQuizImport,
} from '@igra/shared';
import type {
  GameDefinition,
  GluvoDobaDeathReveal,
  GluvoDobaPack,
  QuizImportQuestion,
  KoSamJaImportQuestion,
  KoSamJaCategory,
} from '@igra/shared';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { useNavStore } from '../store/navStore';
import { useGameStore } from '../store/gameStore';
import { useLanguageStore } from '../store/languageStore';
import { LeaveRoomButton } from '../components/LeaveRoomButton';
import { CloseRoomButton } from '../components/CloseRoomButton';
import { CopyRoomLinkButton } from '../components/CopyRoomLinkButton';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n/useT';

interface GeoPackSummary {
  id: string;
  name: string;
  count: number;
}

interface QuestionPackSummary {
  id: string;
  fileName: string;
  count: number;
  questions: QuizImportQuestion[];
}

interface KoSamJaPackSummary {
  id: string;
  fileName: string;
  count: number;
  questions: KoSamJaImportQuestion[];
}

interface GluvoDobaPackSummary extends GluvoDobaPack {
  id: string;
}

const SLEPI_ROUND_OPTIONS = [1, 2, 3, 4];
const PHOTO_OPTIONS = [1, 2, 3, 4];
const FAKE_ARTIST_ROUND_OPTIONS = [1, 2, 3, 4, 5];
const FAKE_ARTIST_STROKE_OPTIONS = [1, 2, 3];
const KO_BI_PRE_ROUND_OPTIONS = [5, 8, 10, 12];
const POGODI_GODINU_ROUND_OPTIONS = [5, 8, 10, 15];
const GLUVO_DOBA_DISCUSSION_OPTIONS = [120, 180, 240];

const GAME_ICONS: Record<string, string> = {
  quiz: '🧠',
  'draw-guess': '🎨',
  fibbage: '🤥',
  'slepi-telefoni': '📝',
  'geo-pogodi': '📍',
  'foto-kviz': '📸',
  'ko-sam-ja': '🕵️',
  'spot-it': '🔴',
  'tajni-agenti': '🟦',
};

export function GameSelectScreen() {
  const room = usePlayerStore((s) => s.room);
  const setScreen = useNavStore((s) => s.setScreen);
  const t = useT();

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [geoPacks, setGeoPacks] = useState<GeoPackSummary[]>([]);
  const [quizPacks, setQuizPacks] = useState<QuestionPackSummary[]>([]);
  const [geoMode, setGeoMode] = useState<'predefined' | 'custom'>('predefined');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [quizImport, setQuizImport] = useState<{
    questions: QuizImportQuestion[];
    fileName: string;
  } | null>(null);
  const [quizImportError, setQuizImportError] = useState<string | null>(null);
  const [koSamJaPacks, setKoSamJaPacks] = useState<KoSamJaPackSummary[]>([]);
  const [koSamJaImport, setKoSamJaImport] = useState<{
    questions: KoSamJaImportQuestion[];
    fileName: string;
  } | null>(null);
  const [koSamJaImportError, setKoSamJaImportError] = useState<string | null>(
    null
  );
  const [koSamJaCategory, setKoSamJaCategory] =
    useState<KoSamJaCategory>('family');
  const [photosPerPlayer, setPhotosPerPlayer] = useState(2);
  const [slepiRounds, setSlepiRounds] = useState(2);
  const [fakeArtistRounds, setFakeArtistRounds] = useState(3);
  const [fakeArtistStrokes, setFakeArtistStrokes] = useState(2);
  const [koBiPreRounds, setKoBiPreRounds] = useState(8);
  const [pogodiGodinuRounds, setPogodiGodinuRounds] = useState(10);
  const [gluvoDobaDiscussion, setGluvoDobaDiscussion] = useState(180);
  const [gluvoDeathReveal, setGluvoDeathReveal] =
    useState<GluvoDobaDeathReveal>('team');
  const [gluvoFirstNight, setGluvoFirstNight] = useState(true);
  const [gluvoBajacica, setGluvoBajacica] = useState(false);
  const [gluvoPacks, setGluvoPacks] = useState<GluvoDobaPackSummary[]>([]);
  const [gluvoPackId, setGluvoPackId] = useState('');
  // Generic per-game round count (quiz, draw-guess, fibbage, geo, foto,
  // ko-sam-ja, spot-it); missing key → GAME_ROUND_CONFIG default.
  const [roundCounts, setRoundCounts] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/geo-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: GeoPackSummary[] }) => {
        if (cancelled) return;
        const list = data.packs ?? [];
        setGeoPacks(list);
        if (list.length > 0) setSelectedPackId((prev) => prev ?? list[0].id);
      })
      .catch(() => {
        if (!cancelled) setGeoPacks([]);
      });
    fetch('/api/question-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: QuestionPackSummary[] }) => {
        if (!cancelled) setQuizPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setQuizPacks([]);
      });
    fetch('/api/ko-sam-ja-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: KoSamJaPackSummary[] }) => {
        if (!cancelled) setKoSamJaPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setKoSamJaPacks([]);
      });
    fetch('/api/gluvo-doba-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: GluvoDobaPackSummary[] }) => {
        if (!cancelled) setGluvoPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setGluvoPacks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onError = ({ message }: { message: string }) => {
      setErrorMessage(message);
    };
    socket.on('error', onError);
    return () => {
      socket.off('error', onError);
    };
  }, []);

  useEffect(() => {
    if (!errorMessage) return;
    const handle = setTimeout(() => setErrorMessage(null), 5000);
    return () => clearTimeout(handle);
  }, [errorMessage]);

  if (!room) return null;

  const connectedCount = room.players.filter((p) => p.isConnected).length;
  const games: GameDefinition[] = Object.values(GAME_DEFINITIONS);

  const handleStart = (game: GameDefinition) => {
    if (connectedCount < game.minPlayers) return;
    const payload: Parameters<typeof socket.emit<'host:start-game'>>[1] = {
      gameId: game.id,
    };
    if (game.id === 'geo-pogodi' || game.id === 'foto-kviz') {
      payload.geoMode = geoMode;
      if (geoMode === 'predefined') {
        payload.geoPackId = selectedPackId ?? undefined;
      } else {
        payload.customPhotosPerPlayer = photosPerPlayer;
      }
    }
    if (game.id === 'slepi-telefoni') {
      payload.slepiRounds = slepiRounds;
    }
    if (game.id === 'fake-artist') {
      payload.fakeArtistRounds = fakeArtistRounds;
      payload.fakeArtistStrokes = fakeArtistStrokes;
    }
    if (game.id === 'ko-bi-pre') {
      payload.koBiPreRounds = koBiPreRounds;
    }
    if (game.id === 'pogodi-godinu') {
      payload.pogodiGodinuRounds = pogodiGodinuRounds;
    }
    if (game.id === 'gluvo-doba') {
      payload.gluvoDobaDiscussionSeconds = gluvoDobaDiscussion;
      payload.gluvoDobaDeathReveal = gluvoDeathReveal;
      payload.gluvoDobaFirstNightPeace = gluvoFirstNight;
      const pack = gluvoPacks.find((p) => p.id === gluvoPackId);
      if (pack) {
        // The pack's roster wins — don't also send the roster toggles.
        payload.gluvoDobaPack = {
          name: pack.name,
          wolves: pack.wolves,
          roles: pack.roles,
        };
      } else {
        payload.gluvoDobaBajacica = gluvoBajacica;
      }
    }
    if (GAME_ROUND_CONFIG[game.id]) {
      payload.roundCount =
        roundCounts[game.id] ?? GAME_ROUND_CONFIG[game.id].default;
    }
    if (game.id === 'quiz' && quizImport) {
      payload.customQuestions = quizImport.questions;
    }
    if (game.id === 'ko-sam-ja') {
      payload.koSamJaCategory = koSamJaCategory;
      if (koSamJaImport) {
        payload.customKoSamJaQuestions = koSamJaImport.questions;
      }
    }
    payload.language = useLanguageStore.getState().language;
    // Remember for the lobby's "Igraj ponovo" rematch shortcut.
    useGameStore.getState().setLastStartPayload(payload);
    socket.emit('host:start-game', payload);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1rem',
        width: '100%',
        maxWidth: '480px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          onClick={() => setScreen('lobby')}
          style={{
            padding: '0.5rem 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 800,
            borderRadius: '12px',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--line2)',
            minHeight: '42px',
          }}
        >
          {t('gameSelect.backArrow')}
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <LanguageSwitch />
          <LeaveRoomButton />
          <CloseRoomButton />
        </div>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.3rem',
          }}
        >
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              color: 'var(--pink)',
              background: 'rgba(217,123,108,.14)',
              padding: '4px 9px',
              borderRadius: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            🎮 {t('lobby.canStartFromPhone')}
          </span>
        </div>
        <h1 className="display" style={{ fontSize: '1.6rem', margin: 0 }}>
          {t('gameSelect.title')}
        </h1>
      </div>

      {room.hostless && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
            }}
          >
            {t('lobby.room')}{' '}
            <strong
              className="display"
              style={{
                color: 'var(--text-primary)',
                fontSize: '1.2rem',
                letterSpacing: '0.15rem',
              }}
            >
              {room.code}
            </strong>
          </p>
          <CopyRoomLinkButton code={room.code} />
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '0.6rem 0.9rem',
            background: 'rgba(255, 77, 94, 0.14)',
            border: '1px solid rgba(255, 77, 94, 0.45)',
            borderRadius: '13px',
            color: 'var(--danger)',
            fontSize: '0.85rem',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          {errorMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.65rem',
        }}
      >
        {games.map((game) => {
          const needsTv = room.hostless && !game.supportsHostless;
          const lacking = connectedCount < game.minPlayers;
          const disabled = lacking || needsTv;
          const expanded = selectedGameId === game.id;
          return (
            <div
              key={game.id}
              style={{
                gridColumn: expanded ? '1 / -1' : 'auto',
                borderRadius: '16px',
                background: expanded
                  ? 'linear-gradient(150deg, rgba(217,123,108,.22), var(--bg-secondary))'
                  : 'var(--bg-secondary)',
                border: expanded
                  ? '1px solid rgba(217,123,108,.4)'
                  : '1px solid var(--line)',
                padding: '0.75rem',
                opacity: disabled ? 0.55 : 1,
              }}
            >
              <button
                onClick={() => {
                  if (disabled) return;
                  setSelectedGameId(expanded ? null : game.id);
                }}
                disabled={disabled}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.45rem',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  padding: 0,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    fontSize: '1.5rem',
                    filter: disabled ? 'grayscale(1)' : 'none',
                    lineHeight: 1,
                  }}
                >
                  {GAME_ICONS[game.id] ?? '🎮'}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <strong style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                    {t(`game.${game.id}.name`)}
                  </strong>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                    }}
                  >
                    {game.minPlayers}–{game.maxPlayers}
                    {expanded && (
                      <> · {t(`game.${game.id}.description`)}</>
                    )}
                  </span>
                  {needsTv && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: 'var(--amber)',
                      }}
                    >
                      🔒 {t('gameSelect.needsTv')}
                    </span>
                  )}
                  {!needsTv && lacking && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: 'var(--danger)',
                      }}
                    >
                      {t('gameSelect.needMore', {
                        n: game.minPlayers - connectedCount,
                        noun: t(
                          game.minPlayers - connectedCount === 1
                            ? 'common.player.one'
                            : 'common.player.many'
                        ),
                      })}
                    </span>
                  )}
                </span>
              </button>

              {expanded && !disabled && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                  }}
                >
                  {(game.id === 'geo-pogodi' || game.id === 'foto-kviz') && (
                    <GeoConfig
                      packs={geoPacks}
                      mode={geoMode}
                      setMode={setGeoMode}
                      selectedPackId={selectedPackId}
                      setSelectedPackId={setSelectedPackId}
                      photosPerPlayer={photosPerPlayer}
                      setPhotosPerPlayer={setPhotosPerPlayer}
                    />
                  )}
                  {game.id === 'slepi-telefoni' && (
                    <SlepiConfig
                      rounds={slepiRounds}
                      setRounds={setSlepiRounds}
                    />
                  )}
                  {game.id === 'quiz' && (
                    <QuizConfig
                      packs={quizPacks}
                      imported={quizImport}
                      setImported={setQuizImport}
                      error={quizImportError}
                      setError={setQuizImportError}
                    />
                  )}
                  {game.id === 'ko-sam-ja' && (
                    <KoSamJaConfig
                      packs={koSamJaPacks}
                      imported={koSamJaImport}
                      setImported={setKoSamJaImport}
                      category={koSamJaCategory}
                      setCategory={setKoSamJaCategory}
                      error={koSamJaImportError}
                      setError={setKoSamJaImportError}
                    />
                  )}
                  {game.id === 'fake-artist' && (
                    <>
                      <RoundsConfig
                        label={t('config.rounds')}
                        value={fakeArtistRounds}
                        options={FAKE_ARTIST_ROUND_OPTIONS}
                        onSelect={setFakeArtistRounds}
                      />
                      <RoundsConfig
                        label={t('config.strokes')}
                        value={fakeArtistStrokes}
                        options={FAKE_ARTIST_STROKE_OPTIONS}
                        onSelect={setFakeArtistStrokes}
                      />
                    </>
                  )}
                  {game.id === 'ko-bi-pre' && (
                    <RoundsConfig
                      label={t('config.rounds')}
                      value={koBiPreRounds}
                      options={KO_BI_PRE_ROUND_OPTIONS}
                      onSelect={setKoBiPreRounds}
                    />
                  )}
                  {game.id === 'pogodi-godinu' && (
                    <RoundsConfig
                      label={t('config.rounds')}
                      value={pogodiGodinuRounds}
                      options={POGODI_GODINU_ROUND_OPTIONS}
                      onSelect={setPogodiGodinuRounds}
                    />
                  )}
                  {game.id === 'gluvo-doba' && (
                    <>
                      <RoundsConfig
                        label={t('config.discussionSeconds')}
                        value={gluvoDobaDiscussion}
                        options={GLUVO_DOBA_DISCUSSION_OPTIONS}
                        onSelect={setGluvoDobaDiscussion}
                      />
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.3rem',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {t('config.gluvoMode')}
                        </span>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <Pill
                            active={gluvoPackId === ''}
                            onClick={() => setGluvoPackId('')}
                          >
                            {t('config.gluvoModeClassic')}
                          </Pill>
                          {gluvoPacks.map((p) => (
                            <Pill
                              key={p.id}
                              active={gluvoPackId === p.id}
                              onClick={() => setGluvoPackId(p.id)}
                            >
                              {p.name || p.id}
                            </Pill>
                          ))}
                        </div>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            marginTop: '0.3rem',
                          }}
                        >
                          {t('config.gluvoDeathReveal')}
                        </span>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {(['role', 'team', 'none'] as const).map((v) => (
                            <Pill
                              key={v}
                              active={gluvoDeathReveal === v}
                              onClick={() => setGluvoDeathReveal(v)}
                            >
                              {t(`config.gluvoDeathReveal.${v}`)}
                            </Pill>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <Pill
                            active={gluvoFirstNight}
                            onClick={() => setGluvoFirstNight(!gluvoFirstNight)}
                          >
                            🕊️ {t('config.gluvoFirstNight')}
                          </Pill>
                          {gluvoPackId === '' && (
                            <Pill
                              active={gluvoBajacica}
                              onClick={() => setGluvoBajacica(!gluvoBajacica)}
                            >
                              🕯️ {t('config.gluvoBajacica')}
                            </Pill>
                          )}
                        </div>
                        {gluvoPackId !== '' && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {t('config.gluvoModeNote')}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  {GAME_ROUND_CONFIG[game.id] && (
                    <RoundsConfig
                      label={t('config.rounds')}
                      value={
                        roundCounts[game.id] ??
                        GAME_ROUND_CONFIG[game.id].default
                      }
                      options={GAME_ROUND_CONFIG[game.id].options}
                      onSelect={(n) =>
                        setRoundCounts((prev) => ({ ...prev, [game.id]: n }))
                      }
                    />
                  )}
                  <button className="btn-primary" onClick={() => handleStart(game)}>
                    ▶ {t('gameSelect.start')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GeoConfig({
  packs,
  mode,
  setMode,
  selectedPackId,
  setSelectedPackId,
  photosPerPlayer,
  setPhotosPerPlayer,
}: {
  packs: GeoPackSummary[];
  mode: 'predefined' | 'custom';
  setMode: (m: 'predefined' | 'custom') => void;
  selectedPackId: string | null;
  setSelectedPackId: (id: string | null) => void;
  photosPerPlayer: number;
  setPhotosPerPlayer: (n: number) => void;
}) {
  const t = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <ModeButton
          active={mode === 'predefined'}
          onClick={() => setMode('predefined')}
        >
          {t('config.predefined')}
        </ModeButton>
        <ModeButton active={mode === 'custom'} onClick={() => setMode('custom')}>
          {t('config.playerPhotos')}
        </ModeButton>
      </div>
      {mode === 'predefined' && (
        <>
          {packs.length === 0 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
              {t('config.noPacks')}
            </span>
          ) : (
            <select
              value={selectedPackId ?? ''}
              onChange={(e) => setSelectedPackId(e.target.value || null)}
              style={{
                padding: '0.6rem 0.7rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                borderRadius: '11px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1.5px solid var(--line2)',
              }}
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {mode === 'custom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {t('config.photosPerPlayer')}
          </span>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {PHOTO_OPTIONS.map((n) => (
              <Pill
                key={n}
                active={n === photosPerPlayer}
                onClick={() => setPhotosPerPlayer(n)}
              >
                {n}
              </Pill>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuizConfig({
  packs,
  imported,
  setImported,
  error,
  setError,
}: {
  packs: QuestionPackSummary[];
  imported: { questions: QuizImportQuestion[]; fileName: string } | null;
  setImported: (
    v: { questions: QuizImportQuestion[]; fileName: string } | null
  ) => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPackId =
    packs.find((p) => p.fileName === imported?.fileName)?.id ?? '';
  const isFileImport = imported !== null && selectedPackId === '';

  const handlePackChange = (id: string) => {
    setError(null);
    if (!id) {
      setImported(null);
      return;
    }
    const pack = packs.find((p) => p.id === id);
    if (!pack) return;
    setImported({ questions: pack.questions, fileName: pack.fileName });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setError(t('import.fileReadError'));
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const result = parseQuizImport(json);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setImported({
          questions: result.questions.map((q) => ({
            text: q.text,
            options: q.options.map((o) => o.text),
            correctIndex: q.correctIndex,
            timeLimit: q.timeLimit,
          })),
          fileName: file.name,
        });
        setError(null);
      } catch {
        setError(t('import.invalidJson'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        {t('import.questionPack')}
      </span>
      <select
        value={selectedPackId}
        onChange={(e) => handlePackChange(e.target.value)}
        disabled={isFileImport}
        style={{
          padding: '0.6rem 0.7rem',
          fontSize: '0.9rem',
          fontWeight: 700,
          borderRadius: '11px',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1.5px solid var(--line2)',
          opacity: isFileImport ? 0.5 : 1,
        }}
      >
        <option value="">{t('import.builtinPack')}</option>
        {packs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id} ({p.count})
          </option>
        ))}
      </select>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      {isFileImport ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            padding: '0.4rem 0.6rem',
            background: 'var(--bg-secondary)',
            borderRadius: '0.4rem',
            border: '1px solid var(--bg-card)',
            fontSize: '0.8rem',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t('import.fromFile')}: <strong>{imported!.fileName}</strong> (
            {imported!.questions.length})
          </span>
          <button
            onClick={() => {
              setImported(null);
              setError(null);
            }}
            style={{
              padding: '0.25rem 0.6rem',
              fontSize: '0.75rem',
              borderRadius: '0.35rem',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--text-secondary)',
            }}
          >
            {t('common.remove')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '0.6rem 0.7rem',
            fontSize: '0.8rem',
            fontWeight: 800,
            borderRadius: '11px',
            background: 'transparent',
            color: 'var(--cyan)',
            border: '1.5px dashed var(--line2)',
          }}
        >
          {t('import.importQuestionsFile')}
        </button>
      )}
      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{error}</span>
      )}
    </div>
  );
}

function KoSamJaConfig({
  packs,
  imported,
  setImported,
  category,
  setCategory,
  error,
  setError,
}: {
  packs: KoSamJaPackSummary[];
  imported: { questions: KoSamJaImportQuestion[]; fileName: string } | null;
  setImported: (
    v: { questions: KoSamJaImportQuestion[]; fileName: string } | null
  ) => void;
  category: KoSamJaCategory;
  setCategory: (c: KoSamJaCategory) => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPackId =
    packs.find((p) => p.fileName === imported?.fileName)?.id ?? '';
  const isFileImport = imported !== null && selectedPackId === '';

  const handlePackChange = (id: string) => {
    setError(null);
    if (!id) {
      setImported(null);
      return;
    }
    const pack = packs.find((p) => p.id === id);
    if (!pack) return;
    setImported({ questions: pack.questions, fileName: pack.fileName });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setError(t('import.fileReadError'));
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const result = parseKoSamJaImport(json);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setImported({ questions: result.questions, fileName: file.name });
        setError(null);
      } catch {
        setError(t('import.invalidJson'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <ModeButton
          active={category === 'family'}
          onClick={() => setCategory('family')}
        >
          Family
        </ModeButton>
        <ModeButton
          active={category === 'nsfw'}
          onClick={() => setCategory('nsfw')}
        >
          NSFW
        </ModeButton>
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        {t('import.questionPack')}
      </span>
      <select
        value={selectedPackId}
        onChange={(e) => handlePackChange(e.target.value)}
        disabled={isFileImport}
        style={{
          padding: '0.6rem 0.7rem',
          fontSize: '0.9rem',
          fontWeight: 700,
          borderRadius: '11px',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1.5px solid var(--line2)',
          opacity: isFileImport ? 0.5 : 1,
        }}
      >
        <option value="">{t('import.builtinPack')}</option>
        {packs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id} ({p.count})
          </option>
        ))}
      </select>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      {isFileImport ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            padding: '0.4rem 0.6rem',
            background: 'var(--bg-secondary)',
            borderRadius: '0.4rem',
            border: '1px solid var(--bg-card)',
            fontSize: '0.8rem',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t('import.fromFile')}: <strong>{imported!.fileName}</strong> (
            {imported!.questions.length})
          </span>
          <button
            onClick={() => {
              setImported(null);
              setError(null);
            }}
            style={{
              padding: '0.25rem 0.6rem',
              fontSize: '0.75rem',
              borderRadius: '0.35rem',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--text-secondary)',
            }}
          >
            {t('common.remove')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '0.6rem 0.7rem',
            fontSize: '0.8rem',
            fontWeight: 800,
            borderRadius: '11px',
            background: 'transparent',
            color: 'var(--cyan)',
            border: '1.5px dashed var(--line2)',
          }}
        >
          {t('import.importQuestionsFile')}
        </button>
      )}
      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{error}</span>
      )}
    </div>
  );
}

// Generic labeled pill row for round / stroke config (Lažni umetnik,
// Ko bi pre, Pogodi godinu).
function RoundsConfig({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: number;
  options: number[];
  onSelect: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {options.map((n) => (
          <Pill key={n} active={n === value} onClick={() => onSelect(n)}>
            {n}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function SlepiConfig({
  rounds,
  setRounds,
}: {
  rounds: number;
  setRounds: (n: number) => void;
}) {
  const t = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        {t('config.rounds')}
      </span>
      <div style={{ display: 'flex', gap: '0.3rem' }}>
        {SLEPI_ROUND_OPTIONS.map((n) => (
          <Pill key={n} active={n === rounds} onClick={() => setRounds(n)}>
            {n}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '0.5rem 0.7rem',
        fontSize: '0.85rem',
        fontWeight: 800,
        borderRadius: '10px',
        background: active ? 'var(--grad)' : 'var(--bg-primary)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: active ? '1px solid transparent' : '1px solid var(--line2)',
      }}
    >
      {children}
    </button>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '0.35rem 0.7rem',
        fontSize: '0.95rem',
        fontWeight: 800,
        borderRadius: '10px',
        background: active ? 'var(--grad)' : 'var(--bg-primary)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: active ? '1px solid transparent' : '1px solid var(--line2)',
        minWidth: '42px',
      }}
    >
      {children}
    </button>
  );
}
