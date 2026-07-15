import { useEffect, useRef, useState } from 'react';
import { parseQuizImport } from '@igra/shared';
import type { KvizQuestionType } from '@igra/shared';
import { useQuizImportStore } from '../store/quizImportStore';
import { useT } from '../i18n/useT';

interface PackSummary {
  id: string;
  fileName: string;
  name: string;
  count: number;
  types: Partial<Record<KvizQuestionType, number>>;
}

const TYPE_BADGES: Record<KvizQuestionType, string> = {
  obicno: '❓',
  geo: '🗺️',
  broj: '🔢',
  audio: '🎵',
  video: '🎬',
};

function typeSummary(types: Partial<Record<KvizQuestionType, number>>): string {
  return (Object.keys(TYPE_BADGES) as KvizQuestionType[])
    .filter((t) => (types[t] ?? 0) > 0)
    .map((t) => `${TYPE_BADGES[t]}${types[t]}`)
    .join(' ');
}

export function QuizImportButton() {
  const { packId, packName, customQuestions, fileName, setPack, setCustom, clear } =
    useQuizImportStore();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [packs, setPacks] = useState<PackSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/question-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: PackSummary[] }) => {
        if (!cancelled) setPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setPacks([]);
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
    // Allow re-selecting the same file later.
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
        // Store the validated wire shape (re-validated on server).
        setCustom(result.manifest.questions, file.name);
        setError(null);
      } catch {
        setError(t('import.invalidJson'));
      }
    };
    reader.readAsText(file);
  };

  const handlePackChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const id = e.target.value;
    if (!id) {
      clear();
      return;
    }
    const pack = packs.find((p) => p.id === id);
    if (!pack) return;
    setPack(pack.id, pack.name);
    setError(null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    clear();
    setError(null);
  };

  const selectedPack = packs.find((p) => p.id === packId);

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

      {packs.length > 0 && (
        <select
          value={packId ?? ''}
          onChange={handlePackChange}
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
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.count})
            </option>
          ))}
        </select>
      )}

      {packId ? (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>
            {t('import.loaded')}: <strong>{packName ?? packId}</strong>
            {selectedPack ? ` (${selectedPack.count})` : ''}
          </p>
          {selectedPack && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              {typeSummary(selectedPack.types)}
            </p>
          )}
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
      ) : customQuestions ? (
        <>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {t('import.loaded')}: <strong>{fileName}</strong> ({customQuestions.length} {t('import.questions')})
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
          {t('import.importQuestions')}
        </button>
      )}

      {error && (
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--danger)',
            margin: 0,
            maxWidth: '200px',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
