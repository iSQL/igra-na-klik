import { useEffect, useRef, useState } from 'react';
import {
  parseTajniAgentiImport,
  findTajniAgentiScenarioByCode,
} from '@igra/shared';
import { useTajniAgentiImportStore } from '../store/tajniAgentiImportStore';

interface BuiltinPack {
  id: string;
  fileName: string;
  name: string | null;
  count: number;
  words: string[];
}

export function TajniAgentiImportButton() {
  const { customPack, fileName, setCustom, clear, scenarioCode, setScenarioCode } =
    useTajniAgentiImportStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [builtinPacks, setBuiltinPacks] = useState<BuiltinPack[]>([]);
  const [scenarioOpen, setScenarioOpen] = useState<boolean>(
    Boolean(scenarioCode)
  );
  const [scenarioDraft, setScenarioDraft] = useState<string>(
    scenarioCode ?? ''
  );

  const matchedScenario =
    scenarioDraft.trim().length > 0
      ? findTajniAgentiScenarioByCode(scenarioDraft)
      : null;

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

  const handlePick = () => {
    setError(null);
    inputRef.current?.click();
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
        const result = parseTajniAgentiImport(json);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setCustom(result.pack, file.name);
        setError(null);
      } catch {
        setError('Nevažeći JSON.');
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
          <option value="">Ugrađene reči</option>
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
            Učitano: <strong>{fileName}</strong> ({customPack.words.length}{' '}
            reči)
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
            Ukloni
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
          Uvezi reči
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
            gap: '0.3rem',
          }}
        >
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
            placeholder="kod"
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
          {scenarioDraft.length > 0 && (
            <p
              style={{
                margin: 0,
                fontSize: '0.7rem',
                color: matchedScenario ? '#2ecc71' : '#e74c3c',
              }}
            >
              {matchedScenario
                ? `✓ ${matchedScenario.name}`
                : 'Nepoznat kod'}
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
              Sačuvaj
            </button>
            {scenarioCode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setScenarioCode(null);
                  setScenarioDraft('');
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
            )}
          </div>
          {scenarioCode && (
            <p
              style={{
                margin: 0,
                fontSize: '0.7rem',
                color: 'var(--accent)',
              }}
            >
              Aktivan: {scenarioCode}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
