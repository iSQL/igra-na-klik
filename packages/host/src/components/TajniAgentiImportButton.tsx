import { useEffect, useRef, useState } from 'react';
import { parseTajniAgentiImport } from '@igra/shared';
import { useTajniAgentiImportStore } from '../store/tajniAgentiImportStore';
import { useT } from '../i18n/useT';

interface BuiltinPack {
  id: string;
  fileName: string;
  name: string | null;
  count: number;
  words: string[];
}

export function TajniAgentiImportButton() {
  const { customPack, fileName, setCustom, clear } = useTajniAgentiImportStore();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [builtinPacks, setBuiltinPacks] = useState<BuiltinPack[]>([]);

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
            color: 'var(--danger)',
            margin: 0,
            maxWidth: '220px',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
