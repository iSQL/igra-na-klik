import { useEffect, useRef, useState } from 'react';
import { parseEmojiImport } from '@igra/shared';
import type { EmojiImportPuzzle } from '@igra/shared';
import { useEmojiImportStore } from '../store/emojiImportStore';
import { useT } from '../i18n/useT';

interface BuiltinPack {
  id: string;
  fileName: string;
  count: number;
  puzzles: EmojiImportPuzzle[];
}

export function EmojiImportButton() {
  const { customPuzzles, fileName, setCustom, clear } = useEmojiImportStore();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [builtinPacks, setBuiltinPacks] = useState<BuiltinPack[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/emoji-packs')
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
        setCustom(result.puzzles, file.name);
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
    if (!id) return;
    const pack = builtinPacks.find((p) => p.id === id);
    if (!pack) return;
    setCustom(pack.puzzles, pack.fileName);
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
          <option value="">{t('import.choosePack')}</option>
          {builtinPacks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} ({p.count})
            </option>
          ))}
        </select>
      )}

      {customPuzzles ? (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>
            {t('import.loaded')}: <strong>{fileName}</strong> ({customPuzzles.length})
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              clear();
              setError(null);
            }}
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
            setError(null);
            inputRef.current?.click();
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
          {t('import.importQuestions')}
        </button>
      )}

      {error && (
        <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: 0, maxWidth: '200px' }}>
          {error}
        </p>
      )}
    </div>
  );
}
