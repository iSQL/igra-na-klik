import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  BITKA_RUNDE_DEF,
  BITKA_QUIZ_TYPES,
  BITKA_RUNDE_IZBOR,
  GAME_DEFINITIONS,
  GAME_ROUND_CONFIG,
  DRAW_GUESS_TIME_OPTIONS,
  SLOZILICA_LETTER_OPTIONS,
  SLOZILICA_LETTER_DEFAULT,
  PUZLA_PIECE_DEFAULT,
  PUZLA_PIECE_OPTIONS,
  KVIZ_CATEGORIES,
  kvizCategory,
  normalizeEmojiAnswer,
  parseKoSamJaImport,
  parseQuizImport,
} from '@igra/shared';
import type {
  GameAccent,
  GameCategory,
  GameDefinition,
  GluvoDobaDeathReveal,
  GluvoDobaPack,
  KvizCategoryId,
  KvizImportQuestion,
  KvizQuestionType,
  KoSamJaImportQuestion,
  KoSamJaCategory,
  TajniAgentiMode,
  HotPotatoMode,
  SpijunLocation,
  AsocijacijePackSummary,
  BitkaMapSummary,
  BitkaMode,
  PuzlaMode,
  BedemLength,
  BedemMode,
} from '@igra/shared';
import {
  getRecentPackIds,
  recordRecentPacks,
} from '../store/quizRecentStore';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { useNavStore } from '../store/navStore';
import { useGameStore } from '../store/gameStore';
import { useLanguageStore } from '../store/languageStore';
import { useT } from '../i18n/useT';
import { ACCENT_HEX } from '../utils/gameAccent';
import { unpackQuizZip } from '../utils/quizZipImport';
import { PuzlaImagePicker } from '../components/PuzlaImagePicker';
import { ProbaPicker, probaRecommended } from '../components/ProbaPicker';

interface QuestionPackSummary {
  id: string;
  fileName: string;
  name: string;
  description?: string;
  category?: KvizCategoryId;
  count: number;
  types: Partial<Record<KvizQuestionType, number>>;
}

// Kviz question-type filter chips (order = display order).
const KVIZ_ALL_TYPES: KvizQuestionType[] = [
  'obicno',
  'audio',
  'video',
  'geo',
  'broj',
  'emoji',
  'uljez',
  'dopuna',
  'piksel',
  'anagram',
  'redosled',
  'domino',
  'matrica',
];
const KVIZ_TYPE_BADGES: Record<KvizQuestionType, string> = {
  obicno: '❓',
  audio: '🎵',
  video: '🎬',
  geo: '🗺️',
  broj: '🔢',
  emoji: '😀',
  uljez: '🕵️',
  dopuna: '✍️',
  piksel: '🧩',
  anagram: '🔀',
  redosled: '↕️',
  domino: '🁢',
  matrica: '🔲',
};

/** Effective checked pack ids (null = all) restricted to loaded packs. */
function effectiveQuizPackIds(
  packs: QuestionPackSummary[],
  selected: string[] | null
): string[] {
  const all = packs.map((p) => p.id);
  if (selected === null) return all;
  return selected.filter((id) => all.includes(id));
}

/** How many questions the current pack × type selection yields. */
function availableQuizCount(
  packs: QuestionPackSummary[],
  selectedIds: string[] | null,
  selectedTypes: KvizQuestionType[] | null
): number {
  const ids = new Set(effectiveQuizPackIds(packs, selectedIds));
  const types = selectedTypes ?? KVIZ_ALL_TYPES;
  let n = 0;
  for (const p of packs) {
    if (!ids.has(p.id)) continue;
    for (const ty of types) n += p.types?.[ty] ?? 0;
  }
  return n;
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

// Effective minimum players for start-gating. In dev, Kviz may run solo (the
// server relaxes the same rule for 'quiz' when NODE_ENV !== 'production').
function effMinPlayers(game: GameDefinition): number {
  return import.meta.env.DEV && game.id === 'quiz' ? 1 : game.minPlayers;
}

const SLEPI_ROUND_OPTIONS = [1, 2, 3, 4];
const FAKE_ARTIST_ROUND_OPTIONS = [1, 2, 3, 4, 5];
const FAKE_ARTIST_STROKE_OPTIONS = [1, 2, 3];
const KO_BI_PRE_ROUND_OPTIONS = [5, 8, 10, 12];
const GLUVO_DOBA_DISCUSSION_OPTIONS = [120, 180, 240];
const SPIJUN_DISCUSSION_OPTIONS = [300, 420, 480, 600];


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
  action: '#57b380', // success green
  word: '#6fc2bb', // cyan
};

// Single-tag filter chips (compound 'drawing-bluff' is covered by drawing+bluff).
const FILTER_CATEGORIES: GameCategory[] = [
  'quiz',
  'drawing',
  'bluff',
  'party',
  'speed',
  'action',
  'word',
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
  const lastStartPayload = useGameStore((s) => s.lastStartPayload);
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
  // Checked packs / question types; null = all. Packs default to none checked
  // ([]) so the player consciously picks what to play; types stay null = all.
  const [quizPackIds, setQuizPackIds] = useState<string[] | null>([]);
  const [quizTypes, setQuizTypes] = useState<KvizQuestionType[] | null>(null);
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
  const [slozilicaLetters, setSlozilicaLetters] = useState(
    SLOZILICA_LETTER_DEFAULT
  );
  const [gluvoDobaDiscussion, setGluvoDobaDiscussion] = useState(180);
  const [gluvoDeathReveal, setGluvoDeathReveal] =
    useState<GluvoDobaDeathReveal>('team');
  const [gluvoFirstNight, setGluvoFirstNight] = useState(true);
  const [gluvoBajacica, setGluvoBajacica] = useState(false);
  const [gluvoPacks, setGluvoPacks] = useState<GluvoDobaPackSummary[]>([]);
  const [gluvoPackId, setGluvoPackId] = useState('');
  const [tajniMode, setTajniMode] = useState<TajniAgentiMode>('classic');
  const [hotPotatoMode, setHotPotatoMode] = useState<HotPotatoMode>('sequential');
  const [hotPotatoAnswerSecs, setHotPotatoAnswerSecs] = useState(5);
  const [spijunPacks, setSpijunPacks] = useState<SpijunPackSummary[]>([]);
  const [spijunPackId, setSpijunPackId] = useState('');
  const [spijunDiscussion, setSpijunDiscussion] = useState(420);
  // Proba vs prava igra (Tok igre 3a), per game; unset = the recommendation.
  const [probaPick, setProbaPick] = useState<Record<string, boolean>>({});
  const [asocijacijePacks, setAsocijacijePacks] = useState<
    AsocijacijePackSummary[]
  >([]);
  // '' = auto-pick the first pack valid for the current mode.
  const [asocijacijePackId, setAsocijacijePackId] = useState('');
  const [bitkaMaps, setBitkaMaps] = useState<BitkaMapSummary[]>([]);
  // '' = auto-pick the first map that passes the strict check (derived below).
  const [bitkaMapChoice, setBitkaMapChoice] = useState('');
  const [bitkaMode, setBitkaMode] = useState<BitkaMode>('zamkovi');
  const [bitkaRounds, setBitkaRounds] = useState<number>(BITKA_RUNDE_DEF);
  const [asocijacijeMode, setAsocijacijeMode] = useState<'klasik' | 'kviz'>(
    'klasik'
  );
  // Generic per-game round count (quiz, draw-guess, fibbage, ko-sam-ja,
  // spot-it); missing key → GAME_ROUND_CONFIG default.
  const [roundCounts, setRoundCounts] = useState<Record<string, number>>({});
  // Puzla: the uploaded picture lives in gameStore (survives leaving this
  // screen); the knobs below are cheap to lose.
  const [puzlaPieces, setPuzlaPieces] = useState(PUZLA_PIECE_DEFAULT);
  const [puzlaRotation, setPuzlaRotation] = useState(false);
  const [puzlaMode, setPuzlaMode] = useState<PuzlaMode>('vreme');
  // Bedem: shared map vs a map each, and how long it runs.
  const [bedemMode, setBedemMode] = useState<BedemMode>('zajedno');
  const [bedemLength, setBedemLength] = useState<BedemLength>('standard');
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
    fetch('/api/asocijacije-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: AsocijacijePackSummary[] }) => {
        if (!cancelled) setAsocijacijePacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setAsocijacijePacks([]);
      });
    fetch('/api/bitka-maps')
      .then((r) => (r.ok ? r.json() : { maps: [] }))
      .then((data: { maps?: BitkaMapSummary[] }) => {
        if (!cancelled) setBitkaMaps(data.maps ?? []);
      })
      .catch(() => {
        if (!cancelled) setBitkaMaps([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the selected Asocijacije pack valid for the current mode.
  useEffect(() => {
    const valid = asocijacijePacks.filter((p) =>
      asocijacijeMode === 'kviz' ? p.kvizPuzzleCount > 0 : p.puzzleCount > 0
    );
    if (!valid.some((p) => p.id === asocijacijePackId)) {
      setAsocijacijePackId(valid[0]?.id ?? '');
    }
  }, [asocijacijePacks, asocijacijeMode, asocijacijePackId]);

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
  const isProba = (gameId: string): boolean =>
    !!GAME_DEFINITIONS[gameId]?.tutorial &&
    (probaPick[gameId] ?? probaRecommended(room.players, gameId));
  const games: GameDefinition[] = Object.values(GAME_DEFINITIONS);
  const visibleGames =
    activeCat === null
      ? games
      : games.filter((g) => gameInCategory(g, activeCat));
  const selectedGame = games.find((g) => g.id === selectedGameId) ?? null;
  const rulesGame = games.find((g) => g.id === rulesGameId) ?? null;
  // Group by what the crew can do right now, not a grid of half-faded cards.
  const needsTv = (g: GameDefinition) => !!room.hostless && !g.supportsHostless;
  const tvOnlyGames = visibleGames.filter(needsTv);
  const needMoreGames = visibleGames.filter(
    (g) => !needsTv(g) && connectedCount < effMinPlayers(g)
  );
  const readyGames = visibleGames.filter(
    (g) => !needsTv(g) && connectedCount >= effMinPlayers(g)
  );
  const lastGame = lastStartPayload
    ? (games.find((g) => g.id === lastStartPayload.gameId) ?? null)
    : null;
  // Tajni agenti: classic needs 4+ players — with fewer, silently fall
  // back to duet so start can't fire a server-side validation error.
  const effectiveTajniMode: TajniAgentiMode =
    tajniMode === 'classic' && connectedCount < 4 ? 'duet' : tajniMode;
  // Osvajanje: derive the effective map so a stale choice can't wedge the
  // start button — no write-back effect needed.
  const validBitkaMaps = bitkaMaps.filter((m) => m.visibleInGame);
  const bitkaMapId = validBitkaMaps.some((m) => m.id === bitkaMapChoice)
    ? bitkaMapChoice
    : (validBitkaMaps[0]?.id ?? '');

  const handleStart = (game: GameDefinition) => {
    if (connectedCount < effMinPlayers(game)) return;
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
      // Kviz mode draws from the same pack multi-select as the Kviz game.
      if (hotPotatoMode === 'kviz') {
        payload.hotPotatoKvizAnswerSeconds = hotPotatoAnswerSecs;
        const ids = effectiveQuizPackIds(quizPacks, quizPackIds);
        if (ids.length > 0) payload.quizPackIds = ids;
      }
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
      if (isProba(game.id)) payload.gluvoDobaTutorial = true;
    }
    if (game.id === 'bolji-zivot' && isProba(game.id)) {
      payload.boljiZivotTutorial = true;
    }
    if (game.id === 'spijun') {
      payload.spijunDiscussionSeconds = spijunDiscussion;
      const pack = spijunPacks.find((p) => p.id === spijunPackId);
      if (pack) {
        payload.spijunPack = { name: pack.name, locations: pack.locations };
      }
      if (isProba(game.id)) payload.spijunTutorial = true;
    }
    if (game.id === 'asocijacije') {
      payload.asocijacijeMode = asocijacijeMode;
      // Empty selection → omit (server falls back to the built-in bank).
      if (asocijacijePackId) payload.asocijacijePackIds = [asocijacijePackId];
    }
    if (game.id === 'osvajanje') {
      // Osvajanje draws its questions from the same kviz pack multi-select.
      if (bitkaMapId) payload.bitkaMapId = bitkaMapId;
      payload.bitkaMode = bitkaMode;
      if (bitkaMode === 'runde') payload.bitkaRounds = bitkaRounds;
      const ids = effectiveQuizPackIds(quizPacks, quizPackIds);
      if (ids.length > 0) payload.quizPackIds = ids;
      // Filter tipova putuje i odavde: hostless soba ima isti selektor, pa bi
      // inače čekiranje na telefonu radilo samo kad partiju pokreće TV.
      // Broji se prema spisku koji KvizAtar ume — sa sva četiri čekirana nema
      // šta da se filtrira.
      if (quizTypes && quizTypes.length < BITKA_QUIZ_TYPES.length) {
        payload.quizTypes = quizTypes;
      }
    }
    if (GAME_ROUND_CONFIG[game.id]) {
      payload.roundCount =
        roundCounts[game.id] ?? GAME_ROUND_CONFIG[game.id].default;
    }
    if (game.id === 'draw-guess') {
      payload.drawTimeLimit = drawGuessTimeLimit;
    }
    if (game.id === 'slozilica') {
      payload.slozilicaLetters = slozilicaLetters;
    }
    if (game.id === 'puzla') {
      const image = useGameStore.getState().puzlaImage;
      if (!image || image.roomCode !== room.code) {
        setErrorMessage(t('puzla.config.needImage'));
        return;
      }
      payload.puzlaImageId = image.imageId;
      payload.puzlaPieces = puzlaPieces;
      payload.puzlaRotation = puzlaRotation;
      payload.puzlaMode = puzlaMode;
    }
    if (game.id === 'bedem') {
      payload.bedemMode = bedemMode;
      payload.bedemLength = bedemLength;
    }
    if (game.id === 'quiz') {
      // Inline file import wins; otherwise the pack multi-select travels as
      // ids (questions stay server-side — answers never reach clients).
      if (quizImport) {
        payload.customQuestions = quizImport.questions;
      } else {
        const ids = effectiveQuizPackIds(quizPacks, quizPackIds);
        if (
          ids.length === 0 ||
          availableQuizCount(quizPacks, quizPackIds, quizTypes) === 0
        ) {
          setErrorMessage(t('quizConfig.emptySelection'));
          return;
        }
        payload.quizPackIds = ids;
        recordRecentPacks(ids);
      }
      if (quizTypes && quizTypes.length < KVIZ_ALL_TYPES.length) {
        payload.quizTypes = quizTypes;
      }
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
        padding: '1rem 0 2rem',
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
          gap: 10,
          padding: '0 20px',
        }}
      >
        <button
          onClick={() => setScreen('lobby')}
          aria-label={t('gameSelect.backToLobby')}
          style={{
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            borderRadius: 14,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--line)',
            color: 'var(--text-primary)',
            fontSize: '1.4rem',
            fontWeight: 800,
          }}
        >
          ‹
        </button>
        <h1
          className="display"
          style={{ flex: 1, margin: 0, fontSize: '1.5rem', lineHeight: 1.1 }}
        >
          {t('gameSelect.title')}
        </h1>
        <span style={{ display: 'flex', alignItems: 'center' }} aria-hidden>
          {room.players.slice(0, 5).map((p, i) => (
            <span
              key={p.id}
              style={{
                width: 28,
                height: 28,
                marginLeft: i === 0 ? 0 : -8,
                borderRadius: '50%',
                background: p.avatarColor,
                border: '2px solid var(--bg-primary)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.85rem',
              }}
            >
              {p.avatarEmoji}
            </span>
          ))}
        </span>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            margin: '12px 20px 0',
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

      {/* One row that scrolls sideways instead of wrapping to three lines. */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          padding: '16px 20px 4px',
          scrollbarWidth: 'none',
        }}
      >
        <FilterChip
          label={t('gameSelect.filterAll')}
          active={activeCat === null}
          onClick={() => setActiveCat(null)}
        />
        {FILTER_CATEGORIES.map((cat) => (
          <FilterChip
            key={cat}
            label={t(`gameTag.${cat}`)}
            active={activeCat === cat}
            onClick={() => setActiveCat(cat)}
          />
        ))}
      </div>

      {lastGame && activeCat === null && (
        <div
          style={{
            margin: '14px 20px 0',
            padding: '12px 12px 12px 14px',
            borderRadius: 18,
            background: 'var(--bg-secondary)',
            border: '1.5px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={tileStyle(lastGame.accent, 44)}>{lastGame.icon}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--amber)',
              }}
            >
              {t('gameSelect.lastGame')}
            </span>
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>
              {t(`game.${lastGame.id}.name`)}
            </span>
          </span>
          <button
            onClick={() => {
              if (lastStartPayload) socket.emit('host:start-game', lastStartPayload);
            }}
            style={{
              height: 40,
              minHeight: 40,
              padding: '0 14px',
              borderRadius: 12,
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              fontWeight: 800,
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
            }}
          >
            {t('gameSelect.again')}
          </button>
        </div>
      )}

      {visibleGames.length === 0 && (
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
      )}

      {readyGames.length > 0 && (
        <>
          <SectionLabel>
            {t('gameSelect.readyCount', { n: readyGames.length })}
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '0 12px' }}>
            {readyGames.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                connectedCount={connectedCount}
                onOpen={() => setSelectedGameId(game.id)}
              />
            ))}
          </div>
        </>
      )}

      {needMoreGames.length > 0 && (
        <>
          <SectionLabel>{t('gameSelect.needMoreSection')}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '0 12px' }}>
            {needMoreGames.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                connectedCount={connectedCount}
                muted
                onOpen={() => {}}
              />
            ))}
          </div>
        </>
      )}

      {tvOnlyGames.length > 0 && (
        <div
          style={{
            margin: '18px 20px 0',
            padding: 16,
            borderRadius: 18,
            background: 'rgba(245,235,224,.05)',
            border: '1px dashed var(--line2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            {t('gameSelect.tvOnlySection')}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tvOnlyGames.map((game) => (
              <span
                key={game.id}
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 12,
                  background: 'var(--bg-secondary)',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {game.icon} {t(`game.${game.id}.name`)}
              </span>
            ))}
          </div>
          <span style={{ fontSize: '0.82rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
            {t('gameSelect.tvOnlyHint')}
          </span>
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
                padding: '8px 20px 4px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ ...tileStyle(selectedGame.accent, 60), borderRadius: 18 }}>
                  {selectedGame.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div
                    className="display"
                    style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1 }}
                  >
                    {t(`game.${selectedGame.id}.name`)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ color: CATEGORY_COLOR[selectedGame.category] }}>
                      {t(`gameTag.${selectedGame.category}`)}
                    </span>
                    <span>
                      {selectedGame.minPlayers}–{selectedGame.maxPlayers}{' '}
                      {t('gameSelect.players')}
                    </span>
                    <span>
                      ~{t('config.minutes', { n: String(selectedGame.estimatedMinutes) })}
                    </span>
                  </div>
                </div>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                }}
              >
                {t(`game.${selectedGame.id}.description`)}
              </p>
              <button
                onClick={() => setRulesGameId(selectedGame.id)}
                style={{
                  height: 48,
                  padding: '0 14px',
                  borderRadius: 14,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontFamily: 'inherit',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  textAlign: 'left',
                }}
              >
                <span>📖</span>
                <span style={{ flex: 1 }}>{t('gameSelect.howToPlayLabel')}</span>
                <span style={{ color: 'var(--dim)', fontSize: '1.3rem' }}>›</span>
              </button>
              <ProbaPicker
                game={selectedGame}
                players={room.players}
                proba={isProba(selectedGame.id)}
                onChange={(on) => setProbaPick((m) => ({ ...m, [selectedGame.id]: on }))}
              />
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
                      selectedIds={quizPackIds}
                      setSelectedIds={setQuizPackIds}
                      selectedTypes={quizTypes}
                      setSelectedTypes={setQuizTypes}
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
                        {(['sequential', 'choose', 'kviz'] as const).map((m) => (
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
                      {hotPotatoMode === 'kviz' && (
                        <>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              marginTop: '0.2rem',
                            }}
                          >
                            {t('config.hotPotatoAnswerSeconds')}
                          </span>
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                            {[5, 8, 10, 15, 20].map((n) => (
                              <Pill
                                key={n}
                                active={n === hotPotatoAnswerSecs}
                                onClick={() => setHotPotatoAnswerSecs(n)}
                              >
                                {n}s
                              </Pill>
                            ))}
                          </div>
                        </>
                      )}
                      {hotPotatoMode === 'kviz' && (
                        <QuizConfig
                          packs={quizPacks}
                          selectedIds={quizPackIds}
                          setSelectedIds={setQuizPackIds}
                          selectedTypes={quizTypes}
                          setSelectedTypes={setQuizTypes}
                          imported={null}
                          setImported={() => {}}
                          error={null}
                          setError={() => {}}
                          hideImport
                        />
                      )}
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
                      </div>
                    </>
                  )}
                  {game.id === 'asocijacije' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Mod
                      </span>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <Pill
                          active={asocijacijeMode === 'klasik'}
                          onClick={() => setAsocijacijeMode('klasik')}
                        >
                          Klasik
                        </Pill>
                        <Pill
                          active={asocijacijeMode === 'kviz'}
                          onClick={() => setAsocijacijeMode('kviz')}
                        >
                          Kviz
                        </Pill>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Slagalice
                      </span>
                      {(() => {
                        const valid = asocijacijePacks.filter((p) =>
                          asocijacijeMode === 'kviz'
                            ? p.kvizPuzzleCount > 0
                            : p.puzzleCount > 0
                        );
                        if (valid.length === 0) {
                          return (
                            <span style={{ fontSize: '0.7rem', color: 'var(--danger, #E5533C)' }}>
                              {asocijacijeMode === 'kviz'
                                ? 'Nema paketa sa kviz slagalicama (napravi u /admin).'
                                : 'Nema paketa slagalica (napravi u /admin).'}
                            </span>
                          );
                        }
                        return (
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                            {valid.map((p) => (
                              <Pill
                                key={p.id}
                                active={asocijacijePackId === p.id}
                                onClick={() => setAsocijacijePackId(p.id)}
                              >
                                {p.name || p.id} (
                                {asocijacijeMode === 'kviz'
                                  ? p.kvizPuzzleCount
                                  : p.puzzleCount}
                                )
                              </Pill>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {game.id === 'osvajanje' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Mapa
                      </span>
                      {validBitkaMaps.length === 0 ? (
                        <span style={{ fontSize: '0.7rem', color: 'var(--danger, #E5533C)' }}>
                          Nema ispravne mape (napravi je u /admin → Mape).
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {validBitkaMaps.map((m) => (
                            <Pill
                              key={m.id}
                              active={bitkaMapId === m.id}
                              onClick={() => setBitkaMapChoice(m.id)}
                            >
                              {m.name} ({m.territoryCount})
                            </Pill>
                          ))}
                        </div>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Trajanje
                      </span>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <Pill
                          active={bitkaMode === 'zamkovi'}
                          onClick={() => setBitkaMode('zamkovi')}
                        >
                          Do poslednjeg zamka
                        </Pill>
                        {BITKA_RUNDE_IZBOR.map((n) => (
                          <Pill
                            key={n}
                            active={bitkaMode === 'runde' && bitkaRounds === n}
                            onClick={() => {
                              setBitkaMode('runde');
                              setBitkaRounds(n);
                            }}
                          >
                            {n} rundi
                          </Pill>
                        ))}
                      </div>
                      {/* Pitanja dolaze iz istih kviz paketa, ali samo tipovi
                          koje igra ume da postavi — filter je ovde stvaran
                          izbor, a ne ukras: matrica je ~3% pakova, pa je
                          čekiranje jedini način da se traži. */}
                      <QuizConfig
                        packs={quizPacks}
                        selectedIds={quizPackIds}
                        setSelectedIds={setQuizPackIds}
                        selectedTypes={quizTypes}
                        setSelectedTypes={setQuizTypes}
                        imported={null}
                        setImported={() => {}}
                        error={null}
                        setError={() => {}}
                        hideImport
                        types={BITKA_QUIZ_TYPES}
                      />
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
                  {game.id === 'slozilica' && (
                    <RoundsConfig
                      label="Broj slova"
                      value={slozilicaLetters}
                      options={[...SLOZILICA_LETTER_OPTIONS]}
                      onSelect={setSlozilicaLetters}
                    />
                  )}
                  {game.id === 'bedem' && (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Režim</span>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <Pill active={bedemMode === 'zajedno'} onClick={() => setBedemMode('zajedno')}>
                            🤝 Zajedno
                          </Pill>
                          <Pill active={bedemMode === 'protiv'} onClick={() => setBedemMode('protiv')}>
                            ⚔️ Protiv
                          </Pill>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                          {bedemMode === 'zajedno'
                            ? 'Jedna mapa i jedna kapija za sve.'
                            : 'Svako brani svoju mapu i šalje neprijatelje drugima.'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Dužina</span>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <Pill active={bedemLength === 'kratko'} onClick={() => setBedemLength('kratko')}>
                            Kratko · 7
                          </Pill>
                          <Pill active={bedemLength === 'standard'} onClick={() => setBedemLength('standard')}>
                            Standard · 10
                          </Pill>
                          <Pill active={bedemLength === 'beskonacno'} onClick={() => setBedemLength('beskonacno')}>
                            ♾️ Beskonačno
                          </Pill>
                        </div>
                      </div>
                    </>
                  )}
                  {game.id === 'puzla' && (
                    <>
                      <PuzlaImagePicker roomCode={room.code} />
                      <RoundsConfig
                        label={t('puzla.config.pieces')}
                        value={puzlaPieces}
                        options={[...PUZLA_PIECE_OPTIONS]}
                        onSelect={setPuzlaPieces}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {t('puzla.config.mode')}
                        </span>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <Pill active={puzlaMode === 'vreme'} onClick={() => setPuzlaMode('vreme')}>
                            ⏳ {t('puzla.config.modeTimed')}
                          </Pill>
                          <Pill active={puzlaMode === 'opusteno'} onClick={() => setPuzlaMode('opusteno')}>
                            ☕ {t('puzla.config.modeRelaxed')}
                          </Pill>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <Pill active={puzlaRotation} onClick={() => setPuzlaRotation(!puzlaRotation)}>
                            🔄 {t('puzla.config.rotation')}
                          </Pill>
                        </div>
                        {puzlaRotation && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            {t('puzla.config.rotationHint')}
                          </span>
                        )}
                      </div>
                    </>
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
                  '12px 20px calc(16px + env(safe-area-inset-bottom))',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Confirms what is about to be played. */}
              <span
                style={{
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                }}
              >
                {connectedCount}{' '}
                {t(connectedCount === 1 ? 'common.player.one' : 'common.player.many')}
                {' · ~'}
                {t('config.minutes', {
                  n: String(
                    isProba(selectedGame.id) && selectedGame.tutorial
                      ? selectedGame.tutorial.minutes
                      : selectedGame.estimatedMinutes
                  ),
                })}
              </span>
              <button
                className="btn-primary"
                onClick={() => handleStart(selectedGame)}
                style={{ display: 'block', width: '100%' }}
              >
                {isProba(selectedGame.id)
                  ? `🎓 ${t('tutorial.startProba')}`
                  : `▶ ${t('gameSelect.start')}`}
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
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        flexShrink: 0,
        height: 40,
        minHeight: 40,
        padding: '0 16px',
        fontSize: '0.88rem',
        fontWeight: active ? 800 : 700,
        fontFamily: 'inherit',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
        background: active ? 'var(--text-primary)' : 'transparent',
        border: active ? '1px solid transparent' : '1px solid var(--line2)',
      }}
    >
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '22px 20px 8px',
        fontSize: '0.75rem',
        fontWeight: 800,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  );
}

// One 72px-tall list row: icon tile, name, full blurb, colored category text.
// Games the group can't start yet render as `muted` rows with a reason chip.
function GameRow({
  game,
  connectedCount,
  muted,
  onOpen,
}: {
  game: GameDefinition;
  connectedCount: number;
  muted?: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const missing = effMinPlayers(game) - connectedCount;
  const inner = (
    <>
      <span
        style={{
          ...tileStyle(game.accent, 52),
          borderRadius: 16,
          ...(muted
            ? {
                background: 'rgba(245,235,224,.06)',
                border: '1px solid transparent',
                filter: 'grayscale(.7)',
              }
            : {}),
        }}
      >
        {game.icon}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: '1rem',
            lineHeight: 1.15,
            color: muted ? 'var(--text-secondary)' : 'var(--text-primary)',
          }}
        >
          {t(`game.${game.id}.name`)}
        </span>
        {!muted && (
          <span
            style={{
              fontSize: '0.82rem',
              lineHeight: 1.3,
              color: 'var(--text-secondary)',
            }}
          >
            {t(`game.${game.id}.blurb`)}
          </span>
        )}
        <span
          style={{
            display: 'flex',
            gap: 8,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--dim)',
            marginTop: 2,
          }}
        >
          {!muted && (
            <span style={{ color: CATEGORY_COLOR[game.category] }}>
              {t(`gameTag.${game.category}`)}
            </span>
          )}
          <span>
            {game.minPlayers}–{game.maxPlayers} {t('gameSelect.players')}
          </span>
          <span>{t('config.minutes', { n: String(game.estimatedMinutes) })}</span>
        </span>
      </span>
      {muted ? (
        <span
          style={{
            height: 36,
            padding: '0 12px',
            borderRadius: 999,
            background: 'rgba(227,180,94,.14)',
            color: 'var(--amber)',
            fontSize: '0.8rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {t('gameSelect.needMore', {
            n: missing,
            noun: t(missing === 1 ? 'common.player.one' : 'common.player.many'),
          })}
        </span>
      ) : (
        <span style={{ fontSize: '1.4rem', color: 'var(--dim)' }}>›</span>
      )}
    </>
  );
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    minHeight: 72,
    padding: '10px 8px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--line)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
  };
  return muted ? (
    <div style={rowStyle}>{inner}</div>
  ) : (
    <button onClick={onOpen} style={rowStyle}>
      {inner}
    </button>
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
  selectedIds,
  setSelectedIds,
  selectedTypes,
  setSelectedTypes,
  imported,
  setImported,
  error,
  setError,
  hideImport,
  types,
}: {
  packs: QuestionPackSummary[];
  selectedIds: string[] | null;
  setSelectedIds: (v: string[] | null) => void;
  selectedTypes: KvizQuestionType[] | null;
  setSelectedTypes: (v: KvizQuestionType[] | null) => void;
  imported: { questions: KvizImportQuestion[]; fileName: string } | null;
  setImported: (
    v: { questions: KvizImportQuestion[]; fileName: string } | null
  ) => void;
  error: string | null;
  setError: (e: string | null) => void;
  /** Hot-potato kviz mode: packs only — no inline .json import. */
  hideImport?: boolean;
  /**
   * Sužava ponuđene tipove na one koje igra ume da postavi. KvizAtar je bez
   * ovoga nudio geo/audio/video čipove koje njegov modul odbacuje.
   */
  types?: KvizQuestionType[];
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const offeredTypes = types ?? KVIZ_ALL_TYPES;
  const isFileImport = imported !== null;
  const checkedIds = effectiveQuizPackIds(packs, selectedIds);
  const checkedTypes = selectedTypes ?? offeredTypes;
  const available = availableQuizCount(packs, selectedIds, selectedTypes ?? types ?? null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const q = normalizeEmojiAnswer(search);
  const matchesSearch = (p: QuestionPackSummary) =>
    !q ||
    normalizeEmojiAnswer(p.name).includes(q) ||
    normalizeEmojiAnswer(p.description ?? '').includes(q);

  // Packs grouped by category, in KVIZ_CATEGORIES order, empty groups dropped.
  const groups = useMemo(() => {
    const visible = packs.filter(matchesSearch);
    return KVIZ_CATEGORIES.map((cat) => ({
      cat,
      items: visible.filter((p) => kvizCategory(p.category).id === cat.id),
    })).filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs, q]);

  const recent = useMemo(() => {
    if (q) return [];
    const byId = new Map(packs.map((p) => [p.id, p]));
    return getRecentPackIds()
      .map((id) => byId.get(id))
      .filter((p): p is QuestionPackSummary => !!p)
      .slice(0, 3);
  }, [packs, q]);

  const togglePack = (id: string) => {
    const next = checkedIds.includes(id)
      ? checkedIds.filter((x) => x !== id)
      : [...checkedIds, id];
    // Everything checked collapses back to null so new packs auto-include.
    setSelectedIds(next.length === packs.length ? null : next);
  };

  const setPacksChecked = (ids: string[], on: boolean) => {
    const cur = new Set(checkedIds);
    ids.forEach((id) => (on ? cur.add(id) : cur.delete(id)));
    const next = [...cur];
    setSelectedIds(next.length === packs.length ? null : next);
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleType = (ty: KvizQuestionType) => {
    const next = checkedTypes.includes(ty)
      ? checkedTypes.filter((x) => x !== ty)
      : [...checkedTypes, ty];
    setSelectedTypes(next.length === KVIZ_ALL_TYPES.length ? null : next);
  };

  const acceptImported = (manifest: unknown, name: string) => {
    const result = parseQuizImport(manifest, { context: 'inline' });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setImported({ questions: result.manifest.questions, fileName: name });
    setError(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isZip =
      /\.zip$/i.test(file.name) ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed';

    if (isZip) {
      file
        .arrayBuffer()
        .then((ab) => unpackQuizZip(new Uint8Array(ab)))
        .then((res) => {
          if (!res.ok) {
            setError(res.error);
            return;
          }
          acceptImported(res.manifest, file.name);
        })
        .catch(() => setError(t('import.fileReadError')));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError(t('import.fileReadError'));
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        acceptImported(json, file.name);
      } catch {
        setError(t('import.invalidJson'));
      }
    };
    reader.readAsText(file);
  };

  // Tiny "Sve / Ništa" bulk-select buttons next to a section label.
  const bulkBtnStyle: CSSProperties = {
    padding: '0.1rem 0.55rem',
    fontSize: '0.68rem',
    fontWeight: 700,
    borderRadius: '999px',
    border: '1px solid var(--line2)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    minHeight: '24px',
    minWidth: 'auto',
  };
  const labelRow = (label: string, onAll: () => void, onNone: () => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <button onClick={onAll} style={bulkBtnStyle}>
        {t('quizConfig.selectAll')}
      </button>
      <button onClick={onNone} style={bulkBtnStyle}>
        {t('quizConfig.selectNone')}
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {!isFileImport && packs.length > 0 && (
        <>
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('quizConfig.search')}
            style={{
              padding: '0.45rem 0.6rem',
              fontSize: '0.85rem',
              borderRadius: '10px',
              border: '1.5px solid var(--line2)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          />

          {/* Recently used */}
          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                🕘 {t('quizConfig.recent')}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {recent.map((p) => (
                  <PackTag
                    key={p.id}
                    active={checkedIds.includes(p.id)}
                    onClick={() => togglePack(p.id)}
                  >
                    {checkedIds.includes(p.id) ? '✓ ' : ''}
                    {p.name}
                  </PackTag>
                ))}
              </div>
            </div>
          )}

          {labelRow(
            t('quizConfig.packs'),
            () => setSelectedIds(null),
            () => setSelectedIds([])
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.1rem',
              maxHeight: '220px',
              overflowY: 'auto',
              padding: '0.4rem 0.5rem',
              background: 'var(--bg-primary)',
              borderRadius: '11px',
              border: '1.5px solid var(--line2)',
            }}
          >
            {groups.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--dim)' }}>
                {t('quizConfig.noResults', { q: search })}
              </span>
            )}
            {groups.map(({ cat, items }) => {
              const ids = items.map((p) => p.id);
              const selInSection = ids.filter((id) => checkedIds.includes(id)).length;
              const allOn = selInSection === ids.length;
              const isCollapsed = collapsed.has(cat.id);
              return (
                <div key={cat.id}>
                  <div
                    onClick={() => toggleCollapse(cat.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      padding: '0.3rem 0',
                    }}
                  >
                    <span style={{ fontSize: '0.65rem', color: 'var(--dim)', width: '10px' }}>
                      {isCollapsed ? '▸' : '▾'}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                      {cat.icon} {cat.label}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--dim)' }}>
                      {selInSection}/{ids.length}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPacksChecked(ids, !allOn);
                      }}
                      style={bulkBtnStyle}
                    >
                      {t('quizConfig.selectAll')}
                    </button>
                  </div>
                  {!isCollapsed &&
                    items.map((p) => {
                      const on = checkedIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: on ? 'var(--text-primary)' : 'var(--dim)',
                            padding: '0.12rem 0 0.12rem 1.1rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => togglePack(p.id)}
                            style={{ minHeight: 'auto', width: '17px', height: '17px' }}
                          />
                          <span style={{ flex: 1 }}>
                            {p.name} ({p.count})
                          </span>
                        </label>
                      );
                    })}
                </div>
              );
            })}
          </div>

          {labelRow(
            t('quizConfig.types'),
            () => setSelectedTypes(types ? [...types] : null),
            () => setSelectedTypes([])
          )}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {offeredTypes.map((ty) => {
              const on = checkedTypes.includes(ty);
              return (
                <button
                  key={ty}
                  onClick={() => toggleType(ty)}
                  title={t(`quizType.${ty}`)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    padding: '0.18rem 0.4rem',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
                    background: on ? 'rgba(194,155,71,0.18)' : 'transparent',
                    color: on ? 'var(--text-primary)' : 'var(--dim)',
                    minHeight: '30px',
                    lineHeight: 1.1,
                  }}
                >
                  <span style={{ opacity: on ? 1 : 0.55 }}>{KVIZ_TYPE_BADGES[ty]}</span>
                  {t(`quizType.${ty}`)}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                flex: 1,
                fontSize: '0.72rem',
                color: available > 0 ? 'var(--text-secondary)' : 'var(--danger)',
              }}
            >
              {available > 0
                ? t('quizConfig.selectedSummary', { packs: checkedIds.length, questions: available })
                : t('quizConfig.emptySelection')}
            </span>
            <button onClick={() => setSelectedIds([])} style={bulkBtnStyle}>
              {t('quizConfig.clear')}
            </button>
          </div>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json,.zip,application/zip"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      {hideImport ? null : isFileImport ? (
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
        background: active ? 'var(--accent)' : 'var(--bg-primary)',
        color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
        border: active ? '1px solid transparent' : '1px solid var(--line2)',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Compact, auto-width toggle tag that wraps across rows — unlike Pill (which
 * uses flex:1 to fill a segmented-control row). Used for the "recently used"
 * pack strip so many packs pack into 2–3 tidy rows.
 */
function PackTag({
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
        padding: '0.12rem 0.5rem',
        fontSize: '0.72rem',
        fontWeight: 700,
        lineHeight: 1.25,
        borderRadius: '999px',
        background: active ? 'var(--accent)' : 'var(--bg-primary)',
        color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
        border: active ? '1px solid transparent' : '1px solid var(--line2)',
        whiteSpace: 'nowrap',
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
        minHeight: '44px',
        fontFamily: 'var(--font-display)',
        fontSize: '1.15rem',
        fontWeight: 700,
        borderRadius: '10px',
        background: active ? 'var(--accent)' : 'var(--bg-primary)',
        color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
        border: active ? '1px solid transparent' : '1px solid var(--line2)',
        minWidth: '42px',
      }}
    >
      {children}
    </button>
  );
}
