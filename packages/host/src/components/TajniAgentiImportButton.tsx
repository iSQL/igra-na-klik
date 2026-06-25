import { useEffect, useRef, useState } from 'react';
import {
  parseTajniAgentiImport,
  parseTajniAgentiScenarioImport,
  lookupTajniAgentiScenario,
} from '@igra/shared';
import type { TajniAgentiScenario } from '@igra/shared';
import { useTajniAgentiImportStore } from '../store/tajniAgentiImportStore';
import { useT } from '../i18n/useT';

interface BuiltinPack {
  id: string;
  fileName: string;
  name: string | null;
  count: number;
  words: string[];
}

interface ServerScenario {
  id: string;
  fileName: string;
  code: string;
  name: string;
  startingTeam: 'red' | 'blue';
  cardCount: number;
  scenario: TajniAgentiScenario;
}

export function TajniAgentiImportButton() {
  const {
    customPack,
    fileName,
    setCustom,
    clear,
    scenarioCode,
    setScenarioCode,
    customScenario,
    setCustomScenario,
  } = useTajniAgentiImportStore();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const scenarioFileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [builtinPacks, setBuiltinPacks] = useState<BuiltinPack[]>([]);
  const [serverScenarios, setServerScenarios] = useState<ServerScenario[]>([]);
  const [scenarioOpen, setScenarioOpen] = useState<boolean>(
    Boolean(scenarioCode || customScenario)
  );
  const [scenarioDraft, setScenarioDraft] = useState<string>(
    scenarioCode ?? ''
  );

  const scenarioLookup =
    scenarioDraft.trim().length > 0
      ? lookupTajniAgentiScenario(scenarioDraft)
      : null;
  const matchedScenario =
    scenarioLookup?.status === 'found' ? scenarioLookup.scenario : null;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tajni-agenti-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: BuiltinPack[] }) => {
        if (!cancelled) setBuiltinPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setBuiltinPacks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tajni-agenti-scenarios')
      .then((r) => (r.ok ? r.json() : { scenarios: [] }))
      .then((data: { scenarios?: ServerScenario[] }) => {
        if (!cancelled) setServerScenarios(data.scenarios ?? []);
      })
      .catch(() => {
        if (!cancelled) setServerScenarios([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleScenarioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setScenarioError(t('import.fileReadError'));
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const result = parseTajniAgentiScenarioImport(json);
        if (!result.ok) {
          setScenarioError(result.error);
          return;
        }
        setCustomScenario({
          source: 'file',
          label: file.name,
          scenario: {
            code: result.scenario.code,
            name: result.scenario.name,
            cards: result.scenario.cards,
          },
        });
        setScenarioError(null);
        setScenarioDraft('');
      } catch {
        setScenarioError(t('import.invalidJson'));
      }
    };
    reader.readAsText(file);
  };

  const handleServerScenarioPick = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    e.stopPropagation();
    const id = e.target.value;
    if (!id) {
      setCustomScenario(null);
      return;
    }
    const found = serverScenarios.find((s) => s.id === id);
    if (!found) return;
    setCustomScenario({
      source: 'server',
      label: found.id,
      scenario: found.scenario,
    });
    setScenarioError(null);
    setScenarioDraft('');
  };

  const selectedServerScenarioId =
    customScenario?.source === 'server' ? customScenario.label : '';

  const handlePick = () => {
    setError(null);
    inputRef.current?.click();
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
        const result = parseTajniAgentiImport(json);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setCustom(result.pack, file.name);
        setError(null);
      } catch {
        setError(t('import.invalidJson'));
      }
    };
    reader.readAsText(file);
  };

  const handleBuiltinChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const id = e.target.value;
    if (!id) {
      clear();
      return;
    }
    const pack = builtinPacks.find((p) => p.id === id);
    if (!pack) return;
    setCustom(
      { name: pack.name ?? undefined, words: pack.words },
      pack.fileName
    );
    setError(null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    clear();
    setError(null);
  };

  const selectedBuiltinId =
    builtinPacks.find((p) => p.fileName === fileName)?.id ?? '';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.4rem',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {builtinPacks.length > 0 && (
        <select
          value={selectedBuiltinId}
          onChange={handleBuiltinChange}
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '0.4rem 0.6rem',
            fontSize: '0.8rem',
            borderRadius: '0.5rem',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--text-secondary)',
            maxWidth: '220px',
          }}
        >
          <option value="">{t('import.builtinWords')}</option>
          {builtinPacks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name ?? p.id} ({p.count})
            </option>
          ))}
        </select>
      )}

      {customPack ? (
        <>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {t('import.loaded')}: <strong>{fileName}</strong> ({customPack.words.length}{' '}
            {t('import.words')})
          </p>
          <button
            onClick={handleClear}
            style={{
              padding: '0.35rem 0.9rem',
              fontSize: '0.8rem',
              borderRadius: '0.5rem',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--text-secondary)',
            }}
          >
            {t('common.remove')}
          </button>
        </>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePick();
          }}
          style={{
            padding: '0.45rem 1rem',
            fontSize: '0.85rem',
            borderRadius: '0.5rem',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--text-secondary)',
          }}
        >
          {t('import.importWords')}
        </button>
      )}

      {error && (
        <p
          style={{
            fontSize: '0.75rem',
            color: '#e74c3c',
            margin: 0,
            maxWidth: '220px',
          }}
        >
          {error}
        </p>
      )}

      {/* Hidden scenario input: a tiny "·" toggle expands a code field. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setScenarioOpen((v) => !v);
        }}
        aria-label="Scenario code"
        title="Scenario code"
        style={{
          marginTop: '0.25rem',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          opacity: scenarioOpen || scenarioCode ? 0.85 : 0.35,
          fontSize: '0.85rem',
          padding: '0 0.25rem',
          lineHeight: 1,
        }}
      >
        ·
      </button>

      {scenarioOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.4rem',
            maxWidth: '240px',
          }}
        >
          <input
            ref={scenarioFileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleScenarioFile}
            style={{ display: 'none' }}
          />

          {/* --- built-in code input ----------------------------------- */}
          <input
            type="text"
            value={scenarioDraft}
            onChange={(e) => setScenarioDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (matchedScenario) {
                  setScenarioCode(matchedScenario.code);
                }
              }
            }}
            placeholder={t('import.codePlaceholder')}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            style={{
              padding: '0.3rem 0.5rem',
              fontSize: '0.85rem',
              borderRadius: '0.4rem',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: `1px solid ${
                scenarioDraft.length === 0
                  ? 'var(--text-secondary)'
                  : matchedScenario
                    ? '#2ecc71'
                    : '#e74c3c'
              }`,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              width: '120px',
              textAlign: 'center',
            }}
          />
          {scenarioLookup && (
            <p
              style={{
                margin: 0,
                fontSize: '0.7rem',
                color: matchedScenario ? '#2ecc71' : '#e74c3c',
                textAlign: 'center',
              }}
            >
              {scenarioLookup.status === 'found'
                ? `✓ ${scenarioLookup.scenario.name}`
                : scenarioLookup.status === 'invalid'
                  ? t('import.invalidScenario', {
                      code: scenarioLookup.code,
                      error: scenarioLookup.error,
                    })
                  : t('import.unknownCode')}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (matchedScenario) {
                  setScenarioCode(matchedScenario.code);
                }
              }}
              disabled={!matchedScenario}
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
                borderRadius: '0.35rem',
                background: matchedScenario
                  ? 'var(--accent)'
                  : 'var(--bg-secondary)',
                color: '#fff',
                border: 'none',
                opacity: matchedScenario ? 1 : 0.4,
              }}
            >
              {t('import.saveCode')}
            </button>
          </div>

          {/* --- server-side scenarios dropdown ------------------------ */}
          {serverScenarios.length > 0 && (
            <select
              value={selectedServerScenarioId}
              onChange={handleServerScenarioPick}
              onClick={(e) => e.stopPropagation()}
              style={{
                padding: '0.3rem 0.5rem',
                fontSize: '0.78rem',
                borderRadius: '0.4rem',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--text-secondary)',
                width: '220px',
              }}
            >
              <option value="">{t('import.scenarioFromServer')}</option>
              {serverScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}, {s.cardCount})
                </option>
              ))}
            </select>
          )}

          {/* --- file-pick a scenario JSON ----------------------------- */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setScenarioError(null);
              scenarioFileRef.current?.click();
            }}
            style={{
              padding: '0.35rem 0.8rem',
              fontSize: '0.78rem',
              borderRadius: '0.4rem',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--text-secondary)',
            }}
          >
            {t('import.importScenario')}
          </button>

          {scenarioError && (
            <p
              style={{
                margin: 0,
                fontSize: '0.7rem',
                color: '#e74c3c',
                textAlign: 'center',
              }}
            >
              {scenarioError}
            </p>
          )}

          {/* --- active-scenario summary + clear ----------------------- */}
          {(scenarioCode || customScenario) && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.25rem',
                marginTop: '0.2rem',
                padding: '0.35rem 0.5rem',
                background: 'var(--bg-secondary)',
                borderRadius: '0.4rem',
                width: '220px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '0.7rem',
                  color: 'var(--accent)',
                  textAlign: 'center',
                }}
              >
                {t('import.active')}:{' '}
                <strong>
                  {customScenario
                    ? `${customScenario.scenario.name} (${customScenario.source === 'file' ? t('import.sourceFile') : t('import.sourceServer')})`
                    : `${t('import.codePrefix')} ${scenarioCode}`}
                </strong>
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setScenarioCode(null);
                  setCustomScenario(null);
                  setScenarioDraft('');
                  setScenarioError(null);
                }}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.7rem',
                  borderRadius: '0.3rem',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--text-secondary)',
                }}
              >
                {t('common.remove')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
