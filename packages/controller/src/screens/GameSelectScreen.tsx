import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  GAME_DEFINITIONS,
  GAME_ROUND_CONFIG,
  DRAW_GUESS_TIME_OPTIONS,
  parseKoSamJaImport,
  parseQuizImport,
  parseEmojiImport,
} from '@igra/shared';
import type {
  GameAccent,
  GameCategory,
  GameDefinition,
  GluvoDobaDeathReveal,
  GluvoDobaPack,
  KvizImportQuestion,
  KoSamJaImportQuestion,
  KoSamJaCategory,
  TajniAgentiMode,
  HotPotatoMode,
  EmojiImportPuzzle,
  SpijunLocation,
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

interface QuestionPackSummary {
  id: string;
  fileName: string;
  name: string;
  count: number;
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

interface SpijunPackSummary {
  id: string;
  name?: string;
  locations: SpijunLocation[];
}

interface EmojiPackSummary {
  id: string;
  fileName: string;
  count: number;
  puzzles: EmojiImportPuzzle[];
}

const SLEPI_ROUND_OPTIONS = [1, 2, 3, 4];
const FAKE_ARTIST_ROUND_OPTIONS = [1, 2, 3, 4, 5];
const FAKE_ARTIST_STROKE_OPTIONS = [1, 2, 3];
const KO_BI_PRE_ROUND_OPTIONS = [5, 8, 10, 12];
const GLUVO_DOBA_DISCUSSION_OPTIONS = [120, 180, 240];
const SPIJUN_DISCUSSION_OPTIONS = [300, 420, 480, 600];

// Accent hex per token — hex (not CSS var) because the card tiles/tags append
// alpha suffixes (e.g. '2b'/'55'/'22'), which var() can't do. Values mirror
// the brand palette in global.css.
const ACCENT_HEX: Record<GameAccent, string> = {
  gold: '#c29b47',
  pink: '#d97b6c',
  violet: '#8fa3d9',
  cyan: '#6fc2bb',
  lime: '#a9c46c',
  amber: '#e3b45e',
  danger: '#e06a5e',
  blue: '#6d9bd1',
};

// Per-category tag color — every game with the same category tag shows the
// same color (independent of the per-game icon accent), so "Crtanje" is never
// two different colors.
const CATEGORY_COLOR: Record<GameCategory, string> = {
  quiz: '#8fa3d9', // violet
  drawing: '#6fc2bb', // cyan
  'drawing-bluff': '#d97b6c', // pink
  bluff: '#e3b45e', // amber
  party: '#a9c46c', // lime
  speed: '#e06a5e', // danger
  team: '#6d9bd1', // blue
  cards: '#c29b47', // gold
};

// Single-tag filter chips (compound 'drawing-bluff' is covered by drawing+bluff).
const FILTER_CATEGORIES: GameCategory[] = [
  'quiz',
  'drawing',
  'bluff',
  'party',
  'speed',
  'team',
  'cards',
];

// A game matches a selected filter category if it equals it, or — for the
// compound 'drawing-bluff' category — if either half is selected.
function gameInCategory(game: GameDefinition, cat: GameCategory): boolean {
  if (game.category === cat) return true;
  if (game.category === 'drawing-bluff')
    return cat === 'drawing' || cat === 'bluff';
  return false;
}

// Colored icon pill (mockup's "tile") — accent hex with alpha wash + border.
function tileStyle(accent: GameAccent, size: number): CSSProperties {
  const hex = ACCENT_HEX[accent];
  return {
    width: size,
    height: size,
    borderRadius: 14,
    background: hex + '2b',
    border: '1px solid ' + hex + '55',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.5,
    flexShrink: 0,
    lineHeight: 1,
  };
}

// Category chip — colored by category so the same tag is always one color.
function tagStyle(category: GameCategory): CSSProperties {
  const hex = CATEGORY_COLOR[category];
  return {
    fontSize: '0.66rem',
    fontWeight: 800,
    color: hex,
    background: hex + '22',
    padding: '3px 8px',
    borderRadius: 7,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
  };
}

export function GameSelectScreen() {
  const room = usePlayerStore((s) => s.room);
  const setScreen = useNavStore((s) => s.setScreen);
  const t = useT();

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [rulesGameId, setRulesGameId] = useState<string | null>(null);
  // Single category filter — null means "Sve" (no filtering).
  const [activeCat, setActiveCat] = useState<GameCategory | null>(null);
  const [quizPacks, setQuizPacks] = useState<QuestionPackSummary[]>([]);
  const [quizImport, setQuizImport] = useState<{
    questions: KvizImportQuestion[];
    fileName: string;
  } | null>(null);
  const [quizPackId, setQuizPackId] = useState('');
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
  const [slepiRounds, setSlepiRounds] = useState(2);
  const [fakeArtistRounds, setFakeArtistRounds] = useState(3);
  const [fakeArtistStrokes, setFakeArtistStrokes] = useState(2);
  const [koBiPreRounds, setKoBiPreRounds] = useState(8);
  const [drawGuessTimeLimit, setDrawGuessTimeLimit] = useState(60);
  const [gluvoDobaDiscussion, setGluvoDobaDiscussion] = useState(180);
  const [gluvoDeathReveal, setGluvoDeathReveal] =
    useState<GluvoDobaDeathReveal>('team');
  const [gluvoFirstNight, setGluvoFirstNight] = useState(true);
  const [gluvoBajacica, setGluvoBajacica] = useState(false);
  const [gluvoPacks, setGluvoPacks] = useState<GluvoDobaPackSummary[]>([]);
  const [gluvoPackId, setGluvoPackId] = useState('');
  const [gluvoTutorial, setGluvoTutorial] = useState(false);
  const [tajniMode, setTajniMode] = useState<TajniAgentiMode>('classic');
  const [hotPotatoMode, setHotPotatoMode] = useState<HotPotatoMode>('sequential');
  const [emojiPacks, setEmojiPacks] = useState<EmojiPackSummary[]>([]);
  const [emojiImport, setEmojiImport] = useState<{
    puzzles: EmojiImportPuzzle[];
    fileName: string;
  } | null>(null);
  const [emojiImportError, setEmojiImportError] = useState<string | null>(null);
  const [emojiHints, setEmojiHints] = useState(true);
  const [bzTutorial, setBzTutorial] = useState(false);
  const [spijunPacks, setSpijunPacks] = useState<SpijunPackSummary[]>([]);
  const [spijunPackId, setSpijunPackId] = useState('');
  const [spijunDiscussion, setSpijunDiscussion] = useState(420);
  const [spijunTutorial, setSpijunTutorial] = useState(false);
  // Generic per-game round count (quiz, draw-guess, fibbage, ko-sam-ja,
  // spot-it); missing key → GAME_ROUND_CONFIG default.
  const [roundCounts, setRoundCounts] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
    fetch('/api/spijun-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: SpijunPackSummary[] }) => {
        if (!cancelled) setSpijunPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setSpijunPacks([]);
      });
    fetch('/api/emoji-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: EmojiPackSummary[] }) => {
        if (!cancelled) setEmojiPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setEmojiPacks([]);
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
  const visibleGames =
    activeCat === null
      ? games
      : games.filter((g) => gameInCategory(g, activeCat));
  const selectedGame = games.find((g) => g.id === selectedGameId) ?? null;
  const rulesGame = games.find((g) => g.id === rulesGameId) ?? null;
  // Tajni agenti: classic needs 4+ players — with fewer, silently fall
  // back to duet so start can't fire a server-side validation error.
  const effectiveTajniMode: TajniAgentiMode =
    tajniMode === 'classic' && connectedCount < 4 ? 'duet' : tajniMode;

  const handleStart = (game: GameDefinition) => {
    if (connectedCount < game.minPlayers) return;
    const payload: Parameters<typeof socket.emit<'host:start-game'>>[1] = {
      gameId: game.id,
    };
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
    if (game.id === 'tajni-agenti') {
      payload.tajniAgentiMode = effectiveTajniMode;
    }
    if (game.id === 'hot-potato') {
      payload.hotPotatoMode = hotPotatoMode;
    }
    if (game.id === 'emoji-zagonetke') {
      payload.emojiHints = emojiHints;
      if (emojiImport) payload.customEmojiPuzzles = emojiImport.puzzles;
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
      if (gluvoTutorial) payload.gluvoDobaTutorial = true;
    }
    if (game.id === 'bolji-zivot' && bzTutorial) {
      payload.boljiZivotTutorial = true;
    }
    if (game.id === 'spijun') {
      payload.spijunDiscussionSeconds = spijunDiscussion;
      const pack = spijunPacks.find((p) => p.id === spijunPackId);
      if (pack) {
        payload.spijunPack = { name: pack.name, locations: pack.locations };
      }
      if (spijunTutorial) payload.spijunTutorial = true;
    }
    if (GAME_ROUND_CONFIG[game.id]) {
      payload.roundCount =
        roundCounts[game.id] ?? GAME_ROUND_CONFIG[game.id].default;
    }
    if (game.id === 'draw-guess') {
      payload.drawTimeLimit = drawGuessTimeLimit;
    }
    if (game.id === 'quiz') {
      // Server pack wins; questions stay server-side (answers never travel).
      if (quizPackId) payload.quizPackId = quizPackId;
      else if (quizImport) payload.customQuestions = quizImport.questions;
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
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
        }}
      >
        <FilterChip
          label={t('gameSelect.filterAll')}
          active={activeCat === null}
          color="#c29b47"
          onClick={() => setActiveCat(null)}
        />
        {FILTER_CATEGORIES.map((cat) => (
          <FilterChip
            key={cat}
            label={t(`gameTag.${cat}`)}
            active={activeCat === cat}
            color={CATEGORY_COLOR[cat]}
            onClick={() => setActiveCat(cat)}
          />
        ))}
      </div>

      {visibleGames.length === 0 ? (
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--dim)',
            textAlign: 'center',
            padding: '1.5rem 0',
          }}
        >
          {t('gameSelect.noGamesForFilter')}
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.65rem',
          }}
        >
          {visibleGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              connectedCount={connectedCount}
              hostless={!!room.hostless}
              onOpen={() => setSelectedGameId(game.id)}
              onRules={() => setRulesGameId(game.id)}
            />
          ))}
        </div>
      )}

      {selectedGame && (
        <div
          onClick={() => setSelectedGameId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11,22,40,.62)',
            backdropFilter: 'blur(3px)',
            zIndex: 40,
            animation: 'igra-fade .18s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 0,
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90%',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              borderBottom: 'none',
              borderRadius: '24px 24px 0 0',
              boxShadow: '0 -18px 50px rgba(0,0,0,.45)',
              animation: 'igra-sheet-up .26s cubic-bezier(.22,1,.36,1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '10px 0 2px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '4px',
                  borderRadius: '99px',
                  background: 'var(--line2)',
                }}
              />
            </div>
            <div
              style={{
                padding: '4px 18px 14px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={tileStyle(selectedGame.accent, 46)}>
                  {selectedGame.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      lineHeight: 1.05,
                    }}
                  >
                    {t(`game.${selectedGame.id}.name`)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--dim)',
                      marginTop: '3px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={tagStyle(selectedGame.category)}>
                      {t(`gameTag.${selectedGame.category}`)}
                    </span>
                    <span>
                      👥 {selectedGame.minPlayers}–{selectedGame.maxPlayers}
                    </span>
                    <span>
                      ⏱{' '}
                      {t('config.minutes', {
                        n: String(selectedGame.estimatedMinutes),
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <p
                style={{
                  margin: '11px 0 0',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                {t(`game.${selectedGame.id}.description`)}
              </p>
              <button
                onClick={() => setRulesGameId(selectedGame.id)}
                style={{
                  marginTop: '9px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: 0,
                  background: 'none',
                  border: 'none',
                  fontFamily: 'inherit',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: 'var(--cyan)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                {t('gameSelect.howToPlay')}
              </button>
            </div>
            <div
              style={{
                overflowY: 'auto',
                padding: '16px 18px 6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              {((game: GameDefinition) => (
                <>
                  {game.id === 'slepi-telefoni' && (
                    <SlepiConfig
                      rounds={slepiRounds}
                      setRounds={setSlepiRounds}
                      connectedCount={connectedCount}
                    />
                  )}
                  {game.id === 'quiz' && (
                    <QuizConfig
                      packs={quizPacks}
                      packId={quizPackId}
                      setPackId={setQuizPackId}
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
                  {game.id === 'tajni-agenti' && (
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
                        {t('config.tajniMode')}
                      </span>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {(['classic', 'duet', 'coop'] as const).map((m) => {
                          const modeLocked = m === 'classic' && connectedCount < 4;
                          return (
                            <Pill
                              key={m}
                              active={m === effectiveTajniMode}
                              onClick={() => {
                                if (!modeLocked) setTajniMode(m);
                              }}
                            >
                              {t(`config.tajniMode.${m}`)}
                            </Pill>
                          );
                        })}
                      </div>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {t(`config.tajniModeHint.${effectiveTajniMode}`)}
                      </span>
                    </div>
                  )}
                  {game.id === 'hot-potato' && (
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
                        {t('config.hotPotatoMode')}
                      </span>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {(['sequential', 'choose'] as const).map((m) => (
                          <Pill
                            key={m}
                            active={m === hotPotatoMode}
                            onClick={() => setHotPotatoMode(m)}
                          >
                            {t(`config.hotPotatoMode.${m}`)}
                          </Pill>
                        ))}
                      </div>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {t(`config.hotPotatoModeHint.${hotPotatoMode}`)}
                      </span>
                    </div>
                  )}
                  {game.id === 'emoji-zagonetke' && (
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
                        {t('config.emojiHints')}
                      </span>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {([true, false] as const).map((on) => (
                          <Pill
                            key={String(on)}
                            active={on === emojiHints}
                            onClick={() => setEmojiHints(on)}
                          >
                            {t(on ? 'config.emojiHintsOn' : 'config.emojiHintsOff')}
                          </Pill>
                        ))}
                      </div>
                      <EmojiConfig
                        packs={emojiPacks}
                        imported={emojiImport}
                        setImported={setEmojiImport}
                        error={emojiImportError}
                        setError={setEmojiImportError}
                      />
                    </div>
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
                          <Pill
                            active={gluvoTutorial}
                            onClick={() => setGluvoTutorial(!gluvoTutorial)}
                          >
                            🎓 {t('config.gluvoTutorial')}
                          </Pill>
                        </div>
                        {gluvoTutorial && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {t('config.gluvoTutorialHint')}
                          </span>
                        )}
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
                  {game.id === 'spijun' && (
                    <>
                      <RoundsConfig
                        label={t('config.discussionSeconds')}
                        value={spijunDiscussion}
                        options={SPIJUN_DISCUSSION_OPTIONS}
                        onSelect={setSpijunDiscussion}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {spijunPacks.length > 0 && (
                          <>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {t('config.spijunPack')}
                            </span>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                              <Pill
                                active={spijunPackId === ''}
                                onClick={() => setSpijunPackId('')}
                              >
                                {t('config.builtInBank')}
                              </Pill>
                              {spijunPacks.map((p) => (
                                <Pill
                                  key={p.id}
                                  active={spijunPackId === p.id}
                                  onClick={() => setSpijunPackId(p.id)}
                                >
                                  {p.name || p.id}
                                </Pill>
                              ))}
                            </div>
                          </>
                        )}
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <Pill
                            active={spijunTutorial}
                            onClick={() => setSpijunTutorial(!spijunTutorial)}
                          >
                            🎓 {t('config.spijunTutorial')}
                          </Pill>
                        </div>
                        {spijunTutorial && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {t('config.spijunTutorialHint')}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  {game.id === 'bolji-zivot' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <Pill
                          active={bzTutorial}
                          onClick={() => setBzTutorial(!bzTutorial)}
                        >
                          🎓 {t('config.bzTutorial')}
                        </Pill>
                      </div>
                      {bzTutorial && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {t('config.bzTutorialHint')}
                        </span>
                      )}
                    </div>
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
                  {game.id === 'draw-guess' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {t('config.drawTime')}
                      </span>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {DRAW_GUESS_TIME_OPTIONS.map((s) => (
                          <Pill
                            key={s}
                            active={s === drawGuessTimeLimit}
                            onClick={() => setDrawGuessTimeLimit(s)}
                          >
                            {t('config.minutes', { n: String(s / 60) })}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  )}
                  {game.id === 'dve-istine-i-laz' && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--dim)',
                        textAlign: 'center',
                        padding: '6px 0',
                      }}
                    >
                      {t('gameSelect.noConfig')}
                    </div>
                  )}
                </>
              ))(selectedGame)}
            </div>
            <div
              style={{
                padding:
                  '12px 18px calc(16px + env(safe-area-inset-bottom))',
                borderTop: '1px solid var(--line)',
              }}
            >
              <button
                className="btn-primary"
                onClick={() => handleStart(selectedGame)}
              >
                ▶ {t('gameSelect.start')} {t(`game.${selectedGame.id}.name`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {rulesGame && (
        <RulesModal game={rulesGame} onClose={() => setRulesGameId(null)} />
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: '0.72rem',
        fontWeight: 800,
        fontFamily: 'inherit',
        borderRadius: 999,
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '.03em',
        color: active ? color : 'var(--dim)',
        background: active ? color + '22' : 'transparent',
        border: '1px solid ' + (active ? color + '77' : 'var(--line2)'),
      }}
    >
      {label}
    </button>
  );
}

function GameCard({
  game,
  connectedCount,
  hostless,
  onOpen,
  onRules,
}: {
  game: GameDefinition;
  connectedCount: number;
  hostless: boolean;
  onOpen: () => void;
  onRules: () => void;
}) {
  const t = useT();
  const needsTv = hostless && !game.supportsHostless;
  const lacking = connectedCount < game.minPlayers;
  const disabled = lacking || needsTv;
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--line)',
        borderRadius: 18,
        padding: 13,
        opacity: disabled ? 0.5 : 1,
        boxShadow: '0 2px 10px rgba(0,0,0,.14)',
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRules();
        }}
        title="Pravila"
        style={{
          position: 'absolute',
          top: 9,
          right: 9,
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '1px solid var(--line2)',
          background: 'rgba(22,46,78,.5)',
          color: 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 800,
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 2,
        }}
      >
        ?
      </button>
      <button
        onClick={() => {
          if (!disabled) onOpen();
        }}
        disabled={disabled}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          color: 'var(--text-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div style={tileStyle(game.accent, 44)}>{game.icon}</div>
        <div
          style={{
            fontSize: '0.97rem',
            fontWeight: 800,
            lineHeight: 1.1,
            paddingRight: 22,
          }}
        >
          {t(`game.${game.id}.name`)}
        </div>
        <div
          style={{
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.3,
            flex: 1,
          }}
        >
          {t(`game.${game.id}.blurb`)}
        </div>
        <div>
          <span style={tagStyle(game.category)}>
            {t(`gameTag.${game.category}`)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            fontSize: '0.68rem',
            fontWeight: 700,
            color: 'var(--dim)',
          }}
        >
          <span>
            👥 {game.minPlayers}–{game.maxPlayers}
          </span>
          <span>·</span>
          <span>
            ⏱ {t('config.minutes', { n: String(game.estimatedMinutes) })}
          </span>
        </div>
        {needsTv && (
          <div
            style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--amber)' }}
          >
            🔒 {t('gameSelect.needsTv')}
          </div>
        )}
        {!needsTv && lacking && (
          <div
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
          </div>
        )}
      </button>
    </div>
  );
}

function RulesModal({
  game,
  onClose,
}: {
  game: GameDefinition;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,22,40,.66)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 22,
        animation: 'igra-fade .16s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 340,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--line2)',
          borderRadius: 22,
          padding: 22,
          boxShadow: '0 24px 60px rgba(0,0,0,.5)',
          animation: 'igra-pop .24s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={tileStyle(game.accent, 46)}>{game.icon}</div>
          <div>
            <div
              style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.05 }}
            >
              {t(`game.${game.id}.name`)}
            </div>
            <div
              style={{
                fontSize: '0.66rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                color: 'var(--accent)',
                marginTop: 2,
              }}
            >
              {t('gameSelect.howToPlayLabel')}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
            margin: '18px 0 20px',
          }}
        >
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'rgba(194,155,71,.18)',
                  color: 'var(--accent)',
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                {n}
              </span>
              <span
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.45,
                }}
              >
                {t(`game.${game.id}.rule${n}`)}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            minHeight: 48,
            borderRadius: 14,
            border: '1px solid var(--line2)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontWeight: 800,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}

function QuizConfig({
  packs,
  packId,
  setPackId,
  imported,
  setImported,
  error,
  setError,
}: {
  packs: QuestionPackSummary[];
  packId: string;
  setPackId: (id: string) => void;
  imported: { questions: KvizImportQuestion[]; fileName: string } | null;
  setImported: (
    v: { questions: KvizImportQuestion[]; fileName: string } | null
  ) => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFileImport = imported !== null && packId === '';

  const handlePackChange = (id: string) => {
    setError(null);
    setPackId(id);
    if (id) setImported(null);
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
        const result = parseQuizImport(json, { context: 'inline' });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setPackId('');
        setImported({
          questions: result.manifest.questions,
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
        value={packId}
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
            {p.name} ({p.count})
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

function EmojiConfig({
  packs,
  imported,
  setImported,
  error,
  setError,
}: {
  packs: EmojiPackSummary[];
  imported: { puzzles: EmojiImportPuzzle[]; fileName: string } | null;
  setImported: (
    v: { puzzles: EmojiImportPuzzle[]; fileName: string } | null
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
    setImported({ puzzles: pack.puzzles, fileName: pack.fileName });
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
        const result = parseEmojiImport(json);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setImported({ puzzles: result.puzzles, fileName: file.name });
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
            {imported!.puzzles.length})
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
  connectedCount,
}: {
  rounds: number;
  setRounds: (n: number) => void;
  connectedCount: number;
}) {
  const t = useT();
  const showWarning =
    connectedCount > 0 && connectedCount <= 4 && rounds >= 2;
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
      {showWarning && (
        <p
          style={{
            margin: '0.15rem 0 0',
            fontSize: '0.72rem',
            lineHeight: 1.35,
            color: 'var(--warning, #C29B47)',
          }}
        >
          {t('slepi.roundsWarning', { n: connectedCount })}
        </p>
      )}
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
