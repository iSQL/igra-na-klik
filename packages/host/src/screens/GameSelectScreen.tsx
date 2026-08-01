import { useEffect, useState, type CSSProperties } from 'react';
import { GAME_DEFINITIONS, GAME_ROUND_CONFIG, DRAW_GUESS_TIME_OPTIONS } from '@igra/shared';
import type {
  HostStartGamePayload,
  GluvoDobaPack,
  SpijunLocation,
  GameAccent,
  GameCategory,
  GameDefinition,
  AsocijacijePackSummary,
} from '@igra/shared';

interface GluvoDobaPackSummary extends GluvoDobaPack {
  id: string;
}

interface SpijunPackSummary {
  id: string;
  name?: string;
  locations: SpijunLocation[];
}

// Packs usable for the chosen Asocijacije mode: klasik needs any puzzle,
// kviz needs puzzles whose fields all carry questions.
function validAsocijacijePacks(
  packs: AsocijacijePackSummary[],
  mode: 'klasik' | 'kviz'
): AsocijacijePackSummary[] {
  return packs.filter((p) =>
    mode === 'kviz' ? p.kvizPuzzleCount > 0 : p.puzzleCount > 0
  );
}
import { socket } from '../socket';
import { useRoomStore } from '../store/roomStore';
import { useGameStore } from '../store/gameStore';
import { useQuizImportStore } from '../store/quizImportStore';
import { useSlepiConfigStore } from '../store/slepiConfigStore';
import { useKoSamJaImportStore } from '../store/koSamJaImportStore';
import { useKoSamJaConfigStore } from '../store/koSamJaConfigStore';
import { useTajniAgentiImportStore } from '../store/tajniAgentiImportStore';
import {
  useNewGamesConfigStore,
  KO_BI_PRE_ROUND_OPTIONS,
  FAKE_ARTIST_ROUND_OPTIONS,
  FAKE_ARTIST_STROKE_OPTIONS,
  GLUVO_DOBA_DISCUSSION_OPTIONS,
  GLUVO_DOBA_DEATH_REVEAL_OPTIONS,
  SPIJUN_DISCUSSION_OPTIONS,
  HOT_POTATO_KVIZ_ANSWER_OPTIONS,
} from '../store/newGamesConfigStore';
import { QuizImportButton } from '../components/QuizImportButton';
import {
  KVIZ_ALL_TYPES,
  availableQuestionCount,
  effectivePackIds,
} from '../store/quizImportStore';
import { recordRecentPacks } from '../store/quizRecentStore';
import { KoSamJaImportButton } from '../components/KoSamJaImportButton';
import { TajniAgentiImportButton } from '../components/TajniAgentiImportButton';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useLanguageStore } from '../store/languageStore';
import { useT } from '../i18n/useT';

const SLEPI_ROUND_OPTIONS = [1, 2, 3, 4];

// Effective minimum players for start-gating. In dev, Kviz may run solo so a
// single browser tab exercises the whole flow (the server relaxes the same
// rule for gameId 'quiz' when NODE_ENV !== 'production'). Display ranges keep
// the real minimum.
function effMinPlayers(game: GameDefinition): number {
  return import.meta.env.DEV && game.id === 'quiz' ? 1 : game.minPlayers;
}

// Accent hex per token — hex (not CSS var) because the tiles/tags append alpha
// suffixes (e.g. '2b'/'55'/'22'), which var() can't do. Mirrors global.css and
// the controller's game-select.
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

// Per-category tag color — every game with the same tag shows the same color.
const CATEGORY_COLOR: Record<GameCategory, string> = {
  quiz: '#8fa3d9',
  drawing: '#6fc2bb',
  'drawing-bluff': '#d97b6c',
  bluff: '#e3b45e',
  party: '#a9c46c',
  speed: '#e06a5e',
  team: '#6d9bd1',
  cards: '#c29b47',
  action: '#57b380',
};

// Single-tag filter chips (compound 'drawing-bluff' is covered by drawing+bluff).
const FILTER_CATEGORIES: GameCategory[] = [
  'quiz',
  'drawing',
  'bluff',
  'party',
  'speed',
  'action',
  'team',
  'cards',
];

function gameInCategory(game: GameDefinition, cat: GameCategory): boolean {
  if (game.category === cat) return true;
  if (game.category === 'drawing-bluff')
    return cat === 'drawing' || cat === 'bluff';
  return false;
}

// Colored icon tile — accent hex with alpha wash + border.
function tileStyle(accent: GameAccent, size: number): CSSProperties {
  const hex = ACCENT_HEX[accent];
  return {
    width: size,
    height: size,
    borderRadius: 16,
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
    fontSize: '0.72rem',
    fontWeight: 800,
    color: hex,
    background: hex + '22',
    padding: '4px 10px',
    borderRadius: 8,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
  };
}

export function GameSelectScreen() {
  const setStatus = useRoomStore((s) => s.setStatus);
  const players = useRoomStore((s) => s.players);
  const games = Object.values(GAME_DEFINITIONS);
  const selectedRounds = useSlepiConfigStore((s) => s.selectedRounds);
  const setSelectedRounds = useSlepiConfigStore((s) => s.setSelectedRounds);
  const koSamJaCategory = useKoSamJaConfigStore((s) => s.selectedCategory);
  const setKoSamJaCategory = useKoSamJaConfigStore(
    (s) => s.setSelectedCategory
  );
  const newGamesConfig = useNewGamesConfigStore();
  const setTajniAgentiMode = useNewGamesConfigStore(
    (s) => s.setTajniAgentiMode
  );
  const setHotPotatoMode = useNewGamesConfigStore((s) => s.setHotPotatoMode);
  // Selected individually (not read off the whole-store object) so the
  // pack-reconcile effect below depends on stable, primitive values.
  const asocijacijeMode = useNewGamesConfigStore((s) => s.asocijacijeMode);
  const asocijacijePackId = useNewGamesConfigStore((s) => s.asocijacijePackId);
  const setAsocijacijePackId = useNewGamesConfigStore(
    (s) => s.setAsocijacijePackId
  );
  const connectedCount = players.filter((p) => p.isConnected).length;
  // Classic needs 4+ players — with fewer, silently fall back to duet so
  // the start button can't fire a server-side validation error.
  const effectiveTajniMode =
    newGamesConfig.tajniAgentiMode === 'classic' && connectedCount < 4
      ? 'duet'
      : newGamesConfig.tajniAgentiMode;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gluvoPacks, setGluvoPacks] = useState<GluvoDobaPackSummary[]>([]);
  const [spijunPacks, setSpijunPacks] = useState<SpijunPackSummary[]>([]);
  const [asocijacijePacks, setAsocijacijePacks] = useState<
    AsocijacijePackSummary[]
  >([]);
  // Which game's config popup is open, and which game's rules modal is open.
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [rulesGameId, setRulesGameId] = useState<string | null>(null);
  // Single category filter — null means "Sve" (no filtering).
  const [activeCat, setActiveCat] = useState<GameCategory | null>(null);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
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

  // Keep the selected Asocijacije pack valid for the current mode: if the
  // chosen pack isn't usable (or none is chosen), fall back to the first one.
  //
  // Two things keep this from looping. The write is guarded on the value
  // actually changing — with no valid packs (server down, or no kviz-capable
  // pack in kviz mode) the fallback is '' and the stored id is already '', so
  // re-setting it would spin forever: zustand's set() hands out a new state
  // object even when the value is identical, which re-renders every subscriber
  // and re-fires this effect. And the deps are primitives plus a stable
  // selected setter, not the whole store object (whose identity changes on
  // every unrelated config write).
  useEffect(() => {
    const valid = validAsocijacijePacks(asocijacijePacks, asocijacijeMode);
    const fallbackId = valid[0]?.id ?? '';
    const stillValid = valid.some((p) => p.id === asocijacijePackId);
    if (!stillValid && asocijacijePackId !== fallbackId) {
      setAsocijacijePackId(fallbackId);
    }
  }, [asocijacijePacks, asocijacijeMode, asocijacijePackId, setAsocijacijePackId]);

  useEffect(() => {
    if (!errorMessage) return;
    const handle = setTimeout(() => setErrorMessage(null), 6000);
    return () => clearTimeout(handle);
  }, [errorMessage]);

  const handleSelect = (gameId: string) => {
    const def = GAME_DEFINITIONS[gameId];
    if (def && connectedCount < effMinPlayers(def)) return;

    // The chosen Gluvo doba pack (if any) — a missing/deleted id falls back
    // to the built-in bands.
    const gluvoPack =
      gameId === 'gluvo-doba'
        ? gluvoPacks.find((p) => p.id === newGamesConfig.gluvoDobaPackId)
        : undefined;
    // The chosen Špijun location pack — missing id → built-in bank.
    const spijunPack =
      gameId === 'spijun'
        ? spijunPacks.find((p) => p.id === newGamesConfig.spijunPackId)
        : undefined;

    // Kviz-mode Vruć krompir draws from the same pack selection as Kviz.
    const hotPotatoKviz =
      gameId === 'hot-potato' && newGamesConfig.hotPotatoMode === 'kviz';
    const quizImport =
      gameId === 'quiz' || hotPotatoKviz ? useQuizImportStore.getState() : null;
    // Inline file import wins over the pack multi-select (quiz only — the
    // hot-potato kviz mode supports packs, not inline files).
    const customQuestions =
      gameId === 'quiz' ? (quizImport?.customQuestions ?? undefined) : undefined;
    let quizPackIds: string[] | undefined;
    let quizTypes: HostStartGamePayload['quizTypes'];
    if (quizImport) {
      if (!customQuestions) {
        const ids = effectivePackIds(quizImport.packs, quizImport.selectedPackIds);
        // Empty selection would start with 0 questions — refuse client-side.
        if (
          ids.length === 0 ||
          availableQuestionCount(
            quizImport.packs,
            quizImport.selectedPackIds,
            quizImport.selectedTypes
          ) === 0
        ) {
          setErrorMessage(t('quizConfig.emptySelection'));
          return;
        }
        quizPackIds = ids;
        recordRecentPacks(ids);
      }
      // Omit the filter when every type is checked.
      if (
        quizImport.selectedTypes &&
        quizImport.selectedTypes.length < KVIZ_ALL_TYPES.length
      ) {
        quizTypes = quizImport.selectedTypes;
      }
    }
    const slepiRounds =
      gameId === 'slepi-telefoni' ? selectedRounds : undefined;

    const customKoSamJaQuestions =
      gameId === 'ko-sam-ja'
        ? useKoSamJaImportStore.getState().customQuestions ?? undefined
        : undefined;
    const koSamJaCategoryToSend =
      gameId === 'ko-sam-ja' ? koSamJaCategory : undefined;
    const customTajniAgentiPack =
      gameId === 'tajni-agenti'
        ? useTajniAgentiImportStore.getState().customPack ?? undefined
        : undefined;

    const payload: HostStartGamePayload = {
      gameId,
      customQuestions,
      quizPackIds,
      quizTypes,
      slepiRounds,
      koSamJaCategory: koSamJaCategoryToSend,
      customKoSamJaQuestions,
      customTajniAgentiPack,
      tajniAgentiMode:
        gameId === 'tajni-agenti' ? effectiveTajniMode : undefined,
      fakeArtistRounds:
        gameId === 'fake-artist' ? newGamesConfig.fakeArtistRounds : undefined,
      fakeArtistStrokes:
        gameId === 'fake-artist' ? newGamesConfig.fakeArtistStrokes : undefined,
      koBiPreRounds:
        gameId === 'ko-bi-pre' ? newGamesConfig.koBiPreRounds : undefined,
      drawTimeLimit:
        gameId === 'draw-guess' ? newGamesConfig.drawGuessTimeLimit : undefined,
      gluvoDobaDiscussionSeconds:
        gameId === 'gluvo-doba'
          ? newGamesConfig.gluvoDobaDiscussionSeconds
          : undefined,
      gluvoDobaDeathReveal:
        gameId === 'gluvo-doba' ? newGamesConfig.gluvoDobaDeathReveal : undefined,
      gluvoDobaFirstNightPeace:
        gameId === 'gluvo-doba'
          ? newGamesConfig.gluvoDobaFirstNightPeace
          : undefined,
      // The Bajačica toggle only applies to the built-in bands; when a pack
      // is chosen its roster wins, so don't also send it.
      gluvoDobaBajacica:
        gameId === 'gluvo-doba' && !gluvoPack
          ? newGamesConfig.gluvoDobaBajacica
          : undefined,
      gluvoDobaPack:
        gameId === 'gluvo-doba' && gluvoPack
          ? { name: gluvoPack.name, wolves: gluvoPack.wolves, roles: gluvoPack.roles }
          : undefined,
      gluvoDobaTutorial:
        gameId === 'gluvo-doba' && newGamesConfig.gluvoDobaTutorial
          ? true
          : undefined,
      roundCount: GAME_ROUND_CONFIG[gameId]
        ? newGamesConfig.roundCounts[gameId] ??
          GAME_ROUND_CONFIG[gameId].default
        : undefined,
      boljiZivotTutorial:
        gameId === 'bolji-zivot' && newGamesConfig.boljiZivotTutorial
          ? true
          : undefined,
      hotPotatoMode:
        gameId === 'hot-potato' ? newGamesConfig.hotPotatoMode : undefined,
      hotPotatoKvizAnswerSeconds:
        gameId === 'hot-potato' && newGamesConfig.hotPotatoMode === 'kviz'
          ? newGamesConfig.hotPotatoKvizAnswerSeconds
          : undefined,
      spijunDiscussionSeconds:
        gameId === 'spijun' ? newGamesConfig.spijunDiscussionSeconds : undefined,
      spijunPack: spijunPack
        ? { name: spijunPack.name, locations: spijunPack.locations }
        : undefined,
      spijunTutorial:
        gameId === 'spijun' && newGamesConfig.spijunTutorial ? true : undefined,
      asocijacijeMode:
        gameId === 'asocijacije' ? newGamesConfig.asocijacijeMode : undefined,
      // Send the chosen pack id; empty selection → undefined (server falls
      // back to the built-in bank so the game never starts empty).
      asocijacijePackIds:
        gameId === 'asocijacije' && newGamesConfig.asocijacijePackId
          ? [newGamesConfig.asocijacijePackId]
          : undefined,
      language: useLanguageStore.getState().language,
    };
    // Remember for the lobby's "Igraj ponovo" rematch shortcut.
    useGameStore.getState().setLastStartPayload(payload);
    socket.emit('host:start-game', payload);
  };

  const visibleGames =
    activeCat === null
      ? games
      : games.filter((g) => gameInCategory(g, activeCat));
  const selectedGame = games.find((g) => g.id === selectedGameId) ?? null;
  const rulesGame = games.find((g) => g.id === rulesGameId) ?? null;

  // Per-game configuration blocks, rendered inside the config popup.
  const renderConfig = (game: GameDefinition) => (
    <>
      {game.id === 'quiz' && <QuizImportButton />}
      {game.id === 'asocijacije' && (
        <>
          <TextPillRow
            label="Mod"
            value={newGamesConfig.asocijacijeMode}
            options={[
              { value: 'klasik', label: 'Klasik' },
              { value: 'kviz', label: 'Kviz' },
            ]}
            onSelect={(v) =>
              newGamesConfig.setAsocijacijeMode(v as 'klasik' | 'kviz')
            }
          />
          {(() => {
            const valid = validAsocijacijePacks(
              asocijacijePacks,
              newGamesConfig.asocijacijeMode
            );
            if (valid.length === 0) {
              return (
                <p
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--danger, #E5533C)',
                    textAlign: 'center',
                    margin: 0,
                  }}
                >
                  {newGamesConfig.asocijacijeMode === 'kviz'
                    ? 'Nema paketa sa kviz slagalicama — napravi ih u /admin.'
                    : 'Nema paketa slagalica — napravi ih u /admin.'}
                </p>
              );
            }
            return (
              <TextPillRow
                label="Slagalice"
                value={newGamesConfig.asocijacijePackId}
                options={valid.map((p) => ({
                  value: p.id,
                  label: `${p.name || p.id} (${
                    newGamesConfig.asocijacijeMode === 'kviz'
                      ? p.kvizPuzzleCount
                      : p.puzzleCount
                  })`,
                }))}
                onSelect={newGamesConfig.setAsocijacijePackId}
              />
            );
          })()}
        </>
      )}
      {game.id === 'ko-sam-ja' && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            {(['family', 'nsfw'] as const).map((cat) => {
              const active = cat === koSamJaCategory;
              return (
                <button
                  key={cat}
                  onClick={() => setKoSamJaCategory(cat)}
                  style={{
                    padding: '0.35rem 0.8rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    background: active
                      ? 'var(--accent)'
                      : 'var(--bg-secondary)',
                    color: active ? '#fff' : 'var(--text-primary)',
                    minWidth: '64px',
                  }}
                >
                  {cat === 'family' ? 'Family' : 'NSFW'}
                </button>
              );
            })}
          </div>
          <KoSamJaImportButton />
        </>
      )}
      {game.id === 'tajni-agenti' && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            {(['classic', 'duet', 'coop'] as const).map((m) => {
              const active = m === effectiveTajniMode;
              const modeLocked = m === 'classic' && connectedCount < 4;
              return (
                <button
                  key={m}
                  disabled={modeLocked}
                  onClick={() => {
                    if (!modeLocked) setTajniAgentiMode(m);
                  }}
                  style={{
                    padding: '0.35rem 0.8rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    background: active
                      ? 'var(--accent)'
                      : 'var(--bg-secondary)',
                    color: active ? '#fff' : 'var(--text-primary)',
                    opacity: modeLocked ? 0.4 : 1,
                    cursor: modeLocked ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t(`config.tajniMode.${m}`)}
                </button>
              );
            })}
          </div>
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            {t(`config.tajniModeHint.${effectiveTajniMode}`)}
          </p>
          <TajniAgentiImportButton />
        </>
      )}
      {game.id === 'hot-potato' && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap',
            }}
          >
            {(['sequential', 'choose', 'kviz'] as const).map((m) => {
              const active = m === newGamesConfig.hotPotatoMode;
              return (
                <button
                  key={m}
                  onClick={() => setHotPotatoMode(m)}
                  style={{
                    padding: '0.35rem 0.8rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    background: active
                      ? 'var(--accent)'
                      : 'var(--bg-secondary)',
                    color: active ? '#fff' : 'var(--text-primary)',
                  }}
                >
                  {t(`config.hotPotatoMode.${m}`)}
                </button>
              );
            })}
          </div>
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            {t(`config.hotPotatoModeHint.${newGamesConfig.hotPotatoMode}`)}
          </p>
          {newGamesConfig.hotPotatoMode === 'kviz' && (
            <>
              <PillRow
                label={t('config.hotPotatoAnswerSeconds')}
                value={newGamesConfig.hotPotatoKvizAnswerSeconds}
                options={HOT_POTATO_KVIZ_ANSWER_OPTIONS}
                onSelect={newGamesConfig.setHotPotatoKvizAnswerSeconds}
              />
              <QuizImportButton />
            </>
          )}
        </>
      )}
      {game.id === 'slepi-telefoni' && (
        <>
          <PillRow
            label={t('config.rounds')}
            value={selectedRounds}
            options={SLEPI_ROUND_OPTIONS}
            onSelect={setSelectedRounds}
          />
          {connectedCount > 0 &&
            connectedCount <= 4 &&
            selectedRounds >= 2 && (
              <p
                style={{
                  fontSize: '0.78rem',
                  lineHeight: 1.35,
                  color: 'var(--warning, #C29B47)',
                  textAlign: 'center',
                  margin: 0,
                }}
              >
                {t('slepi.roundsWarning', { n: connectedCount })}
              </p>
            )}
        </>
      )}
      {game.id === 'ko-bi-pre' && (
        <PillRow
          label={t('config.rounds')}
          value={newGamesConfig.koBiPreRounds}
          options={KO_BI_PRE_ROUND_OPTIONS}
          onSelect={newGamesConfig.setKoBiPreRounds}
        />
      )}
      {game.id === 'fake-artist' && (
        <>
          <PillRow
            label={t('config.rounds')}
            value={newGamesConfig.fakeArtistRounds}
            options={FAKE_ARTIST_ROUND_OPTIONS}
            onSelect={newGamesConfig.setFakeArtistRounds}
          />
          <PillRow
            label={t('config.strokes')}
            value={newGamesConfig.fakeArtistStrokes}
            options={FAKE_ARTIST_STROKE_OPTIONS}
            onSelect={newGamesConfig.setFakeArtistStrokes}
          />
        </>
      )}
      {game.id === 'gluvo-doba' && (
        <>
          <PillRow
            label={t('config.discussionSeconds')}
            value={newGamesConfig.gluvoDobaDiscussionSeconds}
            options={GLUVO_DOBA_DISCUSSION_OPTIONS}
            onSelect={newGamesConfig.setGluvoDobaDiscussionSeconds}
          />
          <TextPillRow
            label={t('config.gluvoMode')}
            value={newGamesConfig.gluvoDobaPackId}
            options={[
              { value: '', label: t('config.gluvoModeClassic') },
              ...gluvoPacks.map((p) => ({
                value: p.id,
                label: p.name || p.id,
              })),
            ]}
            onSelect={newGamesConfig.setGluvoDobaPackId}
          />
          <TextPillRow
            label={t('config.gluvoDeathReveal')}
            value={newGamesConfig.gluvoDobaDeathReveal}
            options={GLUVO_DOBA_DEATH_REVEAL_OPTIONS.map((v) => ({
              value: v,
              label: t(`config.gluvoDeathReveal.${v}`),
            }))}
            onSelect={(v) =>
              newGamesConfig.setGluvoDobaDeathReveal(
                v as (typeof GLUVO_DOBA_DEATH_REVEAL_OPTIONS)[number]
              )
            }
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.35rem',
              flexWrap: 'wrap',
            }}
          >
            <TogglePill
              label={`🕊️ ${t('config.gluvoFirstNight')}`}
              checked={newGamesConfig.gluvoDobaFirstNightPeace}
              onToggle={newGamesConfig.setGluvoDobaFirstNightPeace}
            />
            {newGamesConfig.gluvoDobaPackId === '' && (
              <TogglePill
                label={`🕯️ ${t('config.gluvoBajacica')}`}
                checked={newGamesConfig.gluvoDobaBajacica}
                onToggle={newGamesConfig.setGluvoDobaBajacica}
              />
            )}
            <TogglePill
              label={`🎓 ${t('config.gluvoTutorial')}`}
              checked={newGamesConfig.gluvoDobaTutorial}
              onToggle={newGamesConfig.setGluvoDobaTutorial}
            />
          </div>
          {newGamesConfig.gluvoDobaTutorial && (
            <p
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              {t('config.gluvoTutorialHint')}
            </p>
          )}
          {newGamesConfig.gluvoDobaPackId !== '' && (
            <p
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              {t('config.gluvoModeNote')}
            </p>
          )}
        </>
      )}
      {game.id === 'spijun' && (
        <>
          <TextPillRow
            label={t('config.discussionSeconds')}
            value={String(newGamesConfig.spijunDiscussionSeconds)}
            options={SPIJUN_DISCUSSION_OPTIONS.map((s) => ({
              value: String(s),
              label: t('config.minutes', { n: String(s / 60) }),
            }))}
            onSelect={(v) =>
              newGamesConfig.setSpijunDiscussionSeconds(Number(v))
            }
          />
          {spijunPacks.length > 0 && (
            <TextPillRow
              label={t('config.spijunPack')}
              value={newGamesConfig.spijunPackId}
              options={[
                { value: '', label: t('config.builtInBank') },
                ...spijunPacks.map((p) => ({
                  value: p.id,
                  label: `${p.name || p.id} (${p.locations.length})`,
                })),
              ]}
              onSelect={newGamesConfig.setSpijunPackId}
            />
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <TogglePill
              label={`🎓 ${t('config.spijunTutorial')}`}
              checked={newGamesConfig.spijunTutorial}
              onToggle={newGamesConfig.setSpijunTutorial}
            />
          </div>
          {newGamesConfig.spijunTutorial && (
            <p
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              {t('config.spijunTutorialHint')}
            </p>
          )}
        </>
      )}
      {game.id === 'bolji-zivot' && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <TogglePill
              label={`🎓 ${t('config.bzTutorial')}`}
              checked={newGamesConfig.boljiZivotTutorial}
              onToggle={newGamesConfig.setBoljiZivotTutorial}
            />
          </div>
          {newGamesConfig.boljiZivotTutorial && (
            <p
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              {t('config.bzTutorialHint')}
            </p>
          )}
        </>
      )}
      {GAME_ROUND_CONFIG[game.id] && (
        <PillRow
          label={t('config.rounds')}
          value={
            newGamesConfig.roundCounts[game.id] ??
            GAME_ROUND_CONFIG[game.id].default
          }
          options={GAME_ROUND_CONFIG[game.id].options}
          onSelect={(n) => newGamesConfig.setRoundCount(game.id, n)}
        />
      )}
      {game.id === 'draw-guess' && (
        <TextPillRow
          label={t('config.drawTime')}
          value={String(newGamesConfig.drawGuessTimeLimit)}
          options={DRAW_GUESS_TIME_OPTIONS.map((s) => ({
            value: String(s),
            label: t('config.minutes', { n: String(s / 60) }),
          }))}
          onSelect={(v) => newGamesConfig.setDrawGuessTimeLimit(Number(v))}
        />
      )}
    </>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '1000px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 10 }}>
        <LanguageSwitch />
      </div>
      <h1 style={{ fontSize: '2rem', margin: 0 }}>{t('gameSelect.title')}</h1>

      {errorMessage && (
        <div
          role="alert"
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'rgba(231, 76, 60, 0.15)',
            border: '1px solid var(--danger)',
            borderRadius: '0.5rem',
            color: '#F0B1A6',
            fontSize: '0.95rem',
            textAlign: 'center',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Category filter chips */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0.5rem',
          width: '100%',
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
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            padding: '2rem 0',
          }}
        >
          {t('gameSelect.noGamesForFilter')}
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '1rem',
            width: '100%',
          }}
        >
          {visibleGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              connectedCount={connectedCount}
              onOpen={() => setSelectedGameId(game.id)}
              onRules={() => setRulesGameId(game.id)}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setStatus('lobby')}
        style={{
          padding: '0.75rem 2rem',
          fontSize: '1rem',
          borderRadius: '0.75rem',
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
        }}
      >
        {t('gameSelect.backToLobby')}
      </button>

      {/* Config popup */}
      {selectedGame && (
        <div
          onClick={() => setSelectedGameId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11,22,40,.62)',
            backdropFilter: 'blur(3px)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            animation: 'igra-fade .18s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '540px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              borderRadius: '24px',
              boxShadow: '0 24px 60px rgba(0,0,0,.5)',
              animation: 'igra-pop-up .26s cubic-bezier(.22,1,.36,1)',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 22px 16px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={tileStyle(selectedGame.accent, 52)}>
                  {selectedGame.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '1.4rem',
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
                      gap: '10px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      marginTop: '5px',
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
                <button
                  onClick={() => setSelectedGameId(null)}
                  aria-label={t('common.close')}
                  style={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: '1px solid var(--line2)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
              <p
                style={{
                  margin: '12px 0 0',
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                {t(`game.${selectedGame.id}.description`)}
              </p>
              <button
                onClick={() => setRulesGameId(selectedGame.id)}
                style={{
                  marginTop: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: 0,
                  background: 'none',
                  border: 'none',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--cyan, #6fc2bb)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                ? {t('gameSelect.howToPlay')}
              </button>
            </div>

            {/* Config body */}
            <div
              style={{
                overflowY: 'auto',
                padding: '18px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              {renderConfig(selectedGame)}
            </div>

            {/* Footer: start */}
            <div
              style={{
                padding: '14px 22px 18px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <button
                onClick={() => handleSelect(selectedGame.id)}
                disabled={connectedCount < effMinPlayers(selectedGame)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.85rem',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  borderRadius: '14px',
                  background:
                    connectedCount < effMinPlayers(selectedGame)
                      ? 'var(--bg-card)'
                      : 'var(--accent)',
                  color:
                    connectedCount < effMinPlayers(selectedGame)
                      ? 'var(--text-secondary)'
                      : '#fff',
                  cursor:
                    connectedCount < effMinPlayers(selectedGame)
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {connectedCount < effMinPlayers(selectedGame)
                  ? t('gameSelect.needMore', {
                      n: effMinPlayers(selectedGame) - connectedCount,
                      noun: t(
                        effMinPlayers(selectedGame) - connectedCount === 1
                          ? 'common.player.one'
                          : 'common.player.many'
                      ),
                    })
                  : `▶ ${t('gameSelect.start')} ${t(
                      `game.${selectedGame.id}.name`
                    )}`}
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

// Compact game card — icon tile, name, blurb, category tag, player/time meta,
// plus a "?" rules button. Clicking the body opens the config popup.
function GameCard({
  game,
  connectedCount,
  onOpen,
  onRules,
}: {
  game: GameDefinition;
  connectedCount: number;
  onOpen: () => void;
  onRules: () => void;
}) {
  const t = useT();
  const lacking = connectedCount < effMinPlayers(game);
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg-card)',
        border: '1px solid var(--line, rgba(255,255,255,.08))',
        borderRadius: 18,
        padding: 16,
        opacity: lacking ? 0.55 : 1,
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        if (lacking) return;
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = '0 10px 26px rgba(0,0,0,.28)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRules();
        }}
        title={t('gameSelect.howToPlayLabel')}
        style={{
          position: 'absolute',
          top: 11,
          right: 11,
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: '1px solid var(--line2)',
          background: 'rgba(22,46,78,.5)',
          color: 'var(--text-secondary)',
          fontSize: 13,
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
          if (!lacking) onOpen();
        }}
        disabled={lacking}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          color: 'var(--text-primary)',
          cursor: lacking ? 'not-allowed' : 'pointer',
        }}
      >
        <div style={tileStyle(game.accent, 48)}>{game.icon}</div>
        <div
          style={{
            fontSize: '1.1rem',
            fontWeight: 800,
            lineHeight: 1.1,
            paddingRight: 24,
          }}
        >
          {t(`game.${game.id}.name`)}
        </div>
        <div
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.35,
            minHeight: '2.2em',
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
            gap: 10,
            fontSize: '0.74rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
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
        {lacking && (
          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              color: 'var(--danger)',
            }}
          >
            {t('gameSelect.needMore', {
              n: effMinPlayers(game) - connectedCount,
              noun: t(
                effMinPlayers(game) - connectedCount === 1
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

// Category filter chip.
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
        padding: '7px 14px',
        fontSize: '0.78rem',
        fontWeight: 800,
        fontFamily: 'inherit',
        borderRadius: 999,
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '.03em',
        color: active ? color : 'var(--text-secondary)',
        background: active ? color + '22' : 'transparent',
        border: '1px solid ' + (active ? color + '77' : 'var(--line2)'),
      }}
    >
      {label}
    </button>
  );
}

// Short 3-step "how to play" rules modal.
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
          maxWidth: 400,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--line2)',
          borderRadius: 22,
          padding: 24,
          boxShadow: '0 24px 60px rgba(0,0,0,.5)',
          animation: 'igra-pop .24s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={tileStyle(game.accent, 48)}>{game.icon}</div>
          <div>
            <div
              style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.05 }}
            >
              {t(`game.${game.id}.name`)}
            </div>
            <div
              style={{
                fontSize: '0.7rem',
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
            gap: 12,
            margin: '20px 0 22px',
          }}
        >
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'rgba(194,155,71,.18)',
                  color: 'var(--accent)',
                  fontSize: 12,
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
                  fontSize: '0.9rem',
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
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}

// Labeled row of number pills for a game's round / stroke config.
function PillRow({
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
    <div>
      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.3rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.35rem',
          flexWrap: 'wrap',
        }}
      >
        {options.map((n) => {
          const active = n === value;
          return (
            <button
              key={n}
              onClick={() => onSelect(n)}
              style={{
                padding: '0.35rem 0.7rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                borderRadius: '6px',
                background: active ? 'var(--accent)' : 'var(--bg-secondary)',
                color: active ? '#fff' : 'var(--text-primary)',
                minWidth: '36px',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// PillRow variant for string-valued options (e.g. Gluvo doba death reveal).
function TextPillRow({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.3rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.35rem',
          flexWrap: 'wrap',
        }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => onSelect(o.value)}
              style={{
                padding: '0.35rem 0.7rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                borderRadius: '6px',
                background: active ? 'var(--accent)' : 'var(--bg-secondary)',
                color: active ? '#fff' : 'var(--text-primary)',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// On/off pill for boolean game options.
function TogglePill({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onToggle(!checked)}
      style={{
        padding: '0.35rem 0.7rem',
        fontSize: '0.8rem',
        fontWeight: 700,
        borderRadius: '6px',
        background: checked ? 'var(--accent)' : 'var(--bg-secondary)',
        color: checked ? '#fff' : 'var(--text-secondary)',
      }}
    >
      {checked ? '✓ ' : ''}
      {label}
    </button>
  );
}
