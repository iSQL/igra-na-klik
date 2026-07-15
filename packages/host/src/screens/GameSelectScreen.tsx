import { useEffect, useState } from 'react';
import { GAME_DEFINITIONS, GAME_ROUND_CONFIG, DRAW_GUESS_TIME_OPTIONS } from '@igra/shared';
import type { HostStartGamePayload, GluvoDobaPack } from '@igra/shared';

interface GluvoDobaPackSummary extends GluvoDobaPack {
  id: string;
}
import { socket } from '../socket';
import { useRoomStore } from '../store/roomStore';
import { useGameStore } from '../store/gameStore';
import { useQuizImportStore } from '../store/quizImportStore';
import { useSlepiConfigStore } from '../store/slepiConfigStore';
import { useGeoConfigStore } from '../store/geoConfigStore';
import { useKoSamJaImportStore } from '../store/koSamJaImportStore';
import { useKoSamJaConfigStore } from '../store/koSamJaConfigStore';
import { useTajniAgentiImportStore } from '../store/tajniAgentiImportStore';
import {
  useNewGamesConfigStore,
  POGODI_GODINU_ROUND_OPTIONS,
  KO_BI_PRE_ROUND_OPTIONS,
  FAKE_ARTIST_ROUND_OPTIONS,
  FAKE_ARTIST_STROKE_OPTIONS,
  GLUVO_DOBA_DISCUSSION_OPTIONS,
  GLUVO_DOBA_DEATH_REVEAL_OPTIONS,
} from '../store/newGamesConfigStore';
import { QuizImportButton } from '../components/QuizImportButton';
import { GeoPackButton } from '../components/GeoPackButton';
import { KoSamJaImportButton } from '../components/KoSamJaImportButton';
import { TajniAgentiImportButton } from '../components/TajniAgentiImportButton';
import { EmojiImportButton } from '../components/EmojiImportButton';
import { useEmojiImportStore } from '../store/emojiImportStore';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useLanguageStore } from '../store/languageStore';
import { useT } from '../i18n/useT';

const SLEPI_ROUND_OPTIONS = [1, 2, 3, 4];

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
  const connectedCount = players.filter((p) => p.isConnected).length;
  // Classic needs 4+ players — with fewer, silently fall back to duet so
  // the start button can't fire a server-side validation error.
  const effectiveTajniMode =
    newGamesConfig.tajniAgentiMode === 'classic' && connectedCount < 4
      ? 'duet'
      : newGamesConfig.tajniAgentiMode;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gluvoPacks, setGluvoPacks] = useState<GluvoDobaPackSummary[]>([]);
  const [pogodiBrojPacks, setPogodiBrojPacks] = useState<
    { id: string; name: string; count: number }[]
  >([]);
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
    fetch('/api/pogodi-broj-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: { id: string; name: string; count: number }[] }) => {
        if (!cancelled) setPogodiBrojPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setPogodiBrojPacks([]);
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
    const handle = setTimeout(() => setErrorMessage(null), 6000);
    return () => clearTimeout(handle);
  }, [errorMessage]);

  const handleSelect = (gameId: string) => {
    const def = GAME_DEFINITIONS[gameId];
    if (def && connectedCount < def.minPlayers) return;

    // The chosen Gluvo doba pack (if any) — a missing/deleted id falls back
    // to the built-in bands.
    const gluvoPack =
      gameId === 'gluvo-doba'
        ? gluvoPacks.find((p) => p.id === newGamesConfig.gluvoDobaPackId)
        : undefined;

    const customQuestions =
      gameId === 'quiz'
        ? useQuizImportStore.getState().customQuestions ?? undefined
        : undefined;
    const slepiRounds =
      gameId === 'slepi-telefoni' ? selectedRounds : undefined;

    let geoPackId: string | undefined;
    let geoMode: 'predefined' | 'custom' | undefined;
    let customPhotosPerPlayer: number | undefined;
    if (gameId === 'geo-pogodi' || gameId === 'foto-kviz') {
      const geo = useGeoConfigStore.getState();
      geoMode = geo.mode;
      if (geo.mode === 'predefined') {
        geoPackId = geo.selectedPackId ?? undefined;
      } else {
        customPhotosPerPlayer = geo.customPhotosPerPlayer;
      }
    }

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
      slepiRounds,
      geoPackId,
      geoMode,
      customPhotosPerPlayer,
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
      pogodiGodinuRounds:
        gameId === 'pogodi-godinu'
          ? newGamesConfig.pogodiGodinuRounds
          : undefined,
      pogodiBrojPackId:
        gameId === 'pogodi-godinu' && newGamesConfig.pogodiBrojPackId
          ? newGamesConfig.pogodiBrojPackId
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
      customEmojiPuzzles:
        gameId === 'emoji-zagonetke'
          ? useEmojiImportStore.getState().customPuzzles ?? undefined
          : undefined,
      emojiHints:
        gameId === 'emoji-zagonetke' ? newGamesConfig.emojiHints : undefined,
      language: useLanguageStore.getState().language,
    };
    // Remember for the lobby's "Igraj ponovo" rematch shortcut.
    useGameStore.getState().setLastStartPayload(payload);
    socket.emit('host:start-game', payload);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '800px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 10 }}>
        <LanguageSwitch />
      </div>
      <h1 style={{ fontSize: '2rem' }}>{t('gameSelect.title')}</h1>

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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1.5rem',
          width: '100%',
        }}
      >
        {games.map((game) => {
          const minPlayers = game.minPlayers;
          const lacking = connectedCount < minPlayers;
          return (
          <div
            key={game.id}
            role="button"
            tabIndex={lacking ? -1 : 0}
            aria-disabled={lacking}
            onClick={() => handleSelect(game.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelect(game.id);
              }
            }}
            style={{
              padding: '1.5rem',
              background: 'var(--bg-card)',
              borderRadius: '1rem',
              textAlign: 'center',
              transition: 'transform 0.15s, background 0.15s',
              color: 'var(--text-primary)',
              cursor: lacking ? 'not-allowed' : 'pointer',
              opacity: lacking ? 0.45 : 1,
            }}
            onMouseEnter={(e) => {
              if (lacking) return;
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.transform = 'scale(1.03)';
            }}
            onMouseLeave={(e) => {
              if (lacking) return;
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>
              {t(`game.${game.id}.name`)}
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {t(`game.${game.id}.description`)}
            </p>
            <p
              style={{
                fontSize: '0.8rem',
                marginTop: '0.5rem',
                color: lacking ? 'var(--danger)' : 'var(--text-secondary)',
              }}
            >
              {lacking
                ? t('gameSelect.needMore', {
                    n: minPlayers - connectedCount,
                    noun: t(
                      minPlayers - connectedCount === 1
                        ? 'common.player.one'
                        : 'common.player.many'
                    ),
                  })
                : t('gameSelect.playerRange', {
                    min: game.minPlayers,
                    max: game.maxPlayers,
                  })}
            </p>
            {game.id === 'quiz' && <QuizImportButton />}
            {(game.id === 'geo-pogodi' || game.id === 'foto-kviz') && <GeoPackButton />}
            {game.id === 'ko-sam-ja' && (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    marginTop: '0.75rem',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {(['family', 'nsfw'] as const).map((cat) => {
                    const active = cat === koSamJaCategory;
                    return (
                      <button
                        key={cat}
                        onClick={(e) => {
                          e.stopPropagation();
                          setKoSamJaCategory(cat);
                        }}
                        style={{
                          padding: '0.3rem 0.75rem',
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
                    marginTop: '0.75rem',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {(['classic', 'duet', 'coop'] as const).map((m) => {
                    const active = m === effectiveTajniMode;
                    const modeLocked = m === 'classic' && connectedCount < 4;
                    return (
                      <button
                        key={m}
                        disabled={modeLocked}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!modeLocked) setTajniAgentiMode(m);
                        }}
                        style={{
                          padding: '0.3rem 0.75rem',
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
                    fontSize: '0.75rem',
                    marginTop: '0.4rem',
                    color: 'var(--text-secondary)',
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
                    marginTop: '0.75rem',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {(['sequential', 'choose'] as const).map((m) => {
                    const active = m === newGamesConfig.hotPotatoMode;
                    return (
                      <button
                        key={m}
                        onClick={(e) => {
                          e.stopPropagation();
                          setHotPotatoMode(m);
                        }}
                        style={{
                          padding: '0.3rem 0.75rem',
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
                    fontSize: '0.75rem',
                    marginTop: '0.4rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t(`config.hotPotatoModeHint.${newGamesConfig.hotPotatoMode}`)}
                </p>
              </>
            )}
            {game.id === 'emoji-zagonetke' && (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    marginTop: '0.75rem',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {([true, false] as const).map((on) => {
                    const active = on === newGamesConfig.emojiHints;
                    return (
                      <button
                        key={String(on)}
                        onClick={(e) => {
                          e.stopPropagation();
                          newGamesConfig.setEmojiHints(on);
                        }}
                        style={{
                          padding: '0.3rem 0.75rem',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          borderRadius: '6px',
                          background: active
                            ? 'var(--accent)'
                            : 'var(--bg-secondary)',
                          color: active ? '#fff' : 'var(--text-primary)',
                        }}
                      >
                        {t(on ? 'config.emojiHintsOn' : 'config.emojiHintsOff')}
                      </button>
                    );
                  })}
                </div>
                <EmojiImportButton />
              </>
            )}
            {game.id === 'slepi-telefoni' && (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    marginTop: '0.75rem',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {SLEPI_ROUND_OPTIONS.map((n) => {
                    const active = n === selectedRounds;
                    return (
                      <button
                        key={n}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRounds(n);
                        }}
                        style={{
                          padding: '0.3rem 0.65rem',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          borderRadius: '6px',
                          background: active
                            ? 'var(--accent)'
                            : 'var(--bg-secondary)',
                          color: active ? '#fff' : 'var(--text-primary)',
                          minWidth: '36px',
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                {connectedCount > 0 &&
                  connectedCount <= 4 &&
                  selectedRounds >= 2 && (
                    <p
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '0.78rem',
                        lineHeight: 1.35,
                        color: 'var(--warning, #C29B47)',
                        textAlign: 'center',
                      }}
                    >
                      {t('slepi.roundsWarning', { n: connectedCount })}
                    </p>
                  )}
              </>
            )}
            {game.id === 'pogodi-godinu' && (
              <>
                <PillRow
                  label={t('config.rounds')}
                  value={newGamesConfig.pogodiGodinuRounds}
                  options={POGODI_GODINU_ROUND_OPTIONS}
                  onSelect={newGamesConfig.setPogodiGodinuRounds}
                />
                <TextPillRow
                  label={t('config.questionPack')}
                  value={newGamesConfig.pogodiBrojPackId}
                  options={[
                    { value: '', label: t('config.builtInBank') },
                    ...pogodiBrojPacks.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.count})`,
                    })),
                  ]}
                  onSelect={newGamesConfig.setPogodiBrojPackId}
                />
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
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: '0.5rem',
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
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      textAlign: 'center',
                      marginTop: '0.35rem',
                    }}
                  >
                    {t('config.gluvoTutorialHint')}
                  </p>
                )}
                {newGamesConfig.gluvoDobaPackId !== '' && (
                  <p
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      textAlign: 'center',
                      marginTop: '0.35rem',
                    }}
                  >
                    {t('config.gluvoModeNote')}
                  </p>
                )}
              </>
            )}
            {game.id === 'bolji-zivot' && (
              <>
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: '0.5rem',
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
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      textAlign: 'center',
                      marginTop: '0.35rem',
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
          </div>
          );
        })}
      </div>

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
    </div>
  );
}

// Labeled row of number pills for a game card's round / stroke config.
// stopPropagation keeps taps from bubbling up to the card's start handler.
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
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ marginTop: '0.75rem' }}
    >
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
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n);
              }}
              style={{
                padding: '0.3rem 0.65rem',
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
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '0.75rem' }}>
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
              onClick={(e) => {
                e.stopPropagation();
                onSelect(o.value);
              }}
              style={{
                padding: '0.3rem 0.65rem',
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
      onClick={(e) => {
        e.stopPropagation();
        onToggle(!checked);
      }}
      style={{
        padding: '0.3rem 0.65rem',
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
