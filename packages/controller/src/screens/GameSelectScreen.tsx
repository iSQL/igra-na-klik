import { useEffect, useRef, useState } from 'react';
import {
  GAME_DEFINITIONS,
  parseKoSamJaImport,
  parseQuizImport,
} from '@igra/shared';
import type {
  GameDefinition,
  QuizImportQuestion,
  KoSamJaImportQuestion,
  KoSamJaCategory,
} from '@igra/shared';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { useNavStore } from '../store/navStore';
import { LeaveRoomButton } from '../components/LeaveRoomButton';

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

const SLEPI_ROUND_OPTIONS = [1, 2, 3, 4];
const PHOTO_OPTIONS = [1, 2, 3, 4];

export function GameSelectScreen() {
  const room = usePlayerStore((s) => s.room);
  const setScreen = useNavStore((s) => s.setScreen);

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
    if (game.id === 'quiz' && quizImport) {
      payload.customQuestions = quizImport.questions;
    }
    if (game.id === 'ko-sam-ja') {
      payload.koSamJaCategory = koSamJaCategory;
      if (koSamJaImport) {
        payload.customKoSamJaQuestions = koSamJaImport.questions;
      }
    }
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
            fontSize: '0.9rem',
            borderRadius: '0.5rem',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--bg-card)',
          }}
        >
          ← Nazad
        </button>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Izaberi igru</h1>
        <LeaveRoomButton />
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '0.6rem 0.9rem',
            background: 'rgba(231, 76, 60, 0.15)',
            border: '1px solid #e74c3c',
            borderRadius: '0.5rem',
            color: '#ffb1ab',
            fontSize: '0.85rem',
            textAlign: 'center',
          }}
        >
          {errorMessage}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {games.map((game) => {
          const lacking = connectedCount < game.minPlayers;
          const expanded = selectedGameId === game.id;
          return (
            <div
              key={game.id}
              style={{
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                padding: '0.85rem 1rem',
                opacity: lacking ? 0.5 : 1,
                border: expanded
                  ? '1px solid var(--accent)'
                  : '1px solid transparent',
              }}
            >
              <button
                onClick={() => {
                  if (lacking) return;
                  setSelectedGameId(expanded ? null : game.id);
                }}
                disabled={lacking}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.25rem',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: lacking ? 'not-allowed' : 'pointer',
                  padding: 0,
                  textAlign: 'left',
                }}
              >
                <strong style={{ fontSize: '1.05rem' }}>{game.name}</strong>
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 400,
                  }}
                >
                  {game.description}
                </span>
                {lacking && (
                  <span style={{ fontSize: '0.8rem', color: '#e07070' }}>
                    Treba još {game.minPlayers - connectedCount}{' '}
                    {game.minPlayers - connectedCount === 1
                      ? 'igrač'
                      : 'igrača'}
                  </span>
                )}
              </button>

              {expanded && !lacking && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--bg-secondary)',
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
                  <button
                    onClick={() => handleStart(game)}
                    style={{
                      padding: '0.8rem 1rem',
                      fontSize: '1rem',
                      fontWeight: 700,
                      borderRadius: '0.6rem',
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                    }}
                  >
                    Pokreni
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <ModeButton
          active={mode === 'predefined'}
          onClick={() => setMode('predefined')}
        >
          Predefinisano
        </ModeButton>
        <ModeButton active={mode === 'custom'} onClick={() => setMode('custom')}>
          Slike igrača
        </ModeButton>
      </div>
      {mode === 'predefined' && (
        <>
          {packs.length === 0 ? (
            <span style={{ fontSize: '0.8rem', color: '#e74c3c' }}>
              Nema dostupnih paketa
            </span>
          ) : (
            <select
              value={selectedPackId ?? ''}
              onChange={(e) => setSelectedPackId(e.target.value || null)}
              style={{
                padding: '0.5rem 0.6rem',
                fontSize: '0.9rem',
                borderRadius: '0.4rem',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--bg-card)',
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
            Slika po igraču
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
    reader.onerror = () => setError('Greška pri čitanju fajla.');
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
        setError('Nevažeći JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        Paket pitanja
      </span>
      <select
        value={selectedPackId}
        onChange={(e) => handlePackChange(e.target.value)}
        disabled={isFileImport}
        style={{
          padding: '0.5rem 0.6rem',
          fontSize: '0.9rem',
          borderRadius: '0.4rem',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--bg-card)',
          opacity: isFileImport ? 0.5 : 1,
        }}
      >
        <option value="">Ugrađeni paket</option>
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
            Iz fajla: <strong>{imported!.fileName}</strong> (
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
            Ukloni
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '0.45rem 0.7rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            borderRadius: '0.4rem',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '1px solid var(--bg-card)',
          }}
        >
          Uvezi pitanja iz fajla
        </button>
      )}
      {error && (
        <span style={{ fontSize: '0.75rem', color: '#e74c3c' }}>{error}</span>
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
    reader.onerror = () => setError('Greška pri čitanju fajla.');
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
        setError('Nevažeći JSON.');
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
        Paket pitanja
      </span>
      <select
        value={selectedPackId}
        onChange={(e) => handlePackChange(e.target.value)}
        disabled={isFileImport}
        style={{
          padding: '0.5rem 0.6rem',
          fontSize: '0.9rem',
          borderRadius: '0.4rem',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--bg-card)',
          opacity: isFileImport ? 0.5 : 1,
        }}
      >
        <option value="">Ugrađeni paket</option>
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
            Iz fajla: <strong>{imported!.fileName}</strong> (
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
            Ukloni
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '0.45rem 0.7rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            borderRadius: '0.4rem',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '1px solid var(--bg-card)',
          }}
        >
          Uvezi pitanja iz fajla
        </button>
      )}
      {error && (
        <span style={{ fontSize: '0.75rem', color: '#e74c3c' }}>{error}</span>
      )}
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        Broj rundi
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
        fontWeight: 700,
        borderRadius: '0.4rem',
        background: active ? 'var(--accent)' : 'var(--bg-secondary)',
        color: active ? '#fff' : 'var(--text-primary)',
        border: '1px solid var(--bg-card)',
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
        padding: '0.35rem 0.7rem',
        fontSize: '0.9rem',
        fontWeight: 700,
        borderRadius: '0.4rem',
        background: active ? 'var(--accent)' : 'var(--bg-secondary)',
        color: active ? '#fff' : 'var(--text-primary)',
        minWidth: '40px',
      }}
    >
      {children}
    </button>
  );
}
