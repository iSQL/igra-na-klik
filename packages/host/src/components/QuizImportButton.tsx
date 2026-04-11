import { useEffect, useRef, useState } from 'react';
import { parseQuizImport } from '@igra/shared';
import type { QuizImportQuestion } from '@igra/shared';
import { useQuizImportStore } from '../store/quizImportStore';

interface BuiltinPack {
  id: string;
  fileName: string;
  count: number;
  questions: QuizImportQuestion[];
}

export function QuizImportButton() {
  const { customQuestions, fileName, setCustom, clear } = useQuizImportStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [builtinPacks, setBuiltinPacks] = useState<BuiltinPack[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/question-packs')
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
    // Allow re-selecting the same file later.
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
        // Store the raw import shape (re-validated on server).
        setCustom(
          result.questions.map((q) => ({
            text: q.text,
            options: q.options.map((o) => o.text),
            correctIndex: q.correctIndex,
            timeLimit: q.timeLimit,
          })),
          file.name
        );
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
    if (!id) return;
    const pack = builtinPacks.find((p) => p.id === id);
    if (!pack) return;
    setCustom(pack.questions, pack.fileName);
    setError(null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    clear();
    setError(null);
  };

  // If the currently loaded pack matches a built-in by fileName, preselect it.
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
          <option value="">Izaberi paket…</option>
          {builtinPacks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} ({p.count})
            </option>
          ))}
        </select>
      )}

      {customQuestions ? (
        <>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Učitano: <strong>{fileName}</strong> ({customQuestions.length} pitanja)
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
          Uvezi pitanja
        </button>
      )}

      {error && (
        <p
          style={{
            fontSize: '0.75rem',
            color: '#e74c3c',
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
