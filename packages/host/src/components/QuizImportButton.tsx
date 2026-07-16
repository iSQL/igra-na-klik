import { useEffect, useRef, useState } from 'react';
import { parseQuizImport } from '@igra/shared';
import type { KvizQuestionType } from '@igra/shared';
import {
  KVIZ_ALL_TYPES,
  availableQuestionCount,
  effectivePackIds,
  useQuizImportStore,
} from '../store/quizImportStore';
import type { QuizPackSummary } from '../store/quizImportStore';
import { useT } from '../i18n/useT';

const TYPE_BADGES: Record<KvizQuestionType, string> = {
  obicno: '❓',
  geo: '🗺️',
  broj: '🔢',
  audio: '🎵',
  video: '🎬',
  emoji: '😀',
};

/**
 * Kviz question-source picker: a multi-select of server packs (the built-in
 * bank arrives as the '__bank__' pseudo-pack from /api/question-packs) plus
 * a question-type filter, or a local .json file inlined as customQuestions.
 */
export function QuizImportButton() {
  const {
    packs,
    selectedPackIds,
    selectedTypes,
    customQuestions,
    fileName,
    setPacks,
    togglePack,
    toggleType,
    setSelectedPackIds,
    setSelectedTypes,
    setCustom,
    clearCustom,
  } = useQuizImportStore();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/question-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: QuizPackSummary[] }) => {
        if (!cancelled) setPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setPacks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [setPacks]);

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

  const checkedIds = effectivePackIds(packs, selectedPackIds);
  const checkedTypes = selectedTypes ?? KVIZ_ALL_TYPES;
  const available = availableQuestionCount(packs, selectedPackIds, selectedTypes);
  const isFileImport = customQuestions !== null;

  // Tiny "Sve / Ništa" bulk-select buttons next to a section label.
  const bulkBtnStyle: React.CSSProperties = {
    padding: '0.1rem 0.5rem',
    fontSize: '0.68rem',
    fontWeight: 700,
    borderRadius: '999px',
    border: '1px solid var(--line2)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    minHeight: '22px',
    minWidth: 'auto',
  };

  const labelRow = (
    label: string,
    onAll: () => void,
    onNone: () => void
  ) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        marginTop: '0.2rem',
      }}
    >
      <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--dim)', fontWeight: 700, textAlign: 'left' }}>
        {label}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAll();
        }}
        style={bulkBtnStyle}
      >
        {t('quizConfig.selectAll')}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNone();
        }}
        style={bulkBtnStyle}
      >
        {t('quizConfig.selectNone')}
      </button>
    </div>
  );

  const chipStyle = (on: boolean): React.CSSProperties => ({
    padding: '0.3rem 0.6rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    borderRadius: '999px',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
    background: on ? 'rgba(194,155,71,0.18)' : 'transparent',
    color: on ? 'var(--text-primary)' : 'var(--dim)',
    minHeight: '32px',
    minWidth: 'auto',
  });

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '0.45rem',
        maxWidth: '320px',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {isFileImport ? (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0, textAlign: 'center' }}>
            {t('import.loaded')}: <strong>{fileName}</strong> ({customQuestions.length}{' '}
            {t('import.questions')})
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearCustom();
              setError(null);
            }}
            style={{
              padding: '0.35rem 0.9rem',
              fontSize: '0.8rem',
              borderRadius: '0.5rem',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--text-secondary)',
              alignSelf: 'center',
            }}
          >
            {t('common.remove')}
          </button>
        </>
      ) : (
        <>
          {packs.length > 0 && (
            <>
              {labelRow(
                t('quizConfig.packs'),
                () => setSelectedPackIds(null),
                () => setSelectedPackIds([])
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  textAlign: 'left',
                }}
              >
                {packs.map((p) => {
                  const on = checkedIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        fontSize: '0.82rem',
                        color: on ? 'var(--text-primary)' : 'var(--dim)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePack(p.id)}
                        style={{ minHeight: 'auto', width: '16px', height: '16px' }}
                      />
                      <span style={{ flex: 1 }}>
                        {p.name} ({p.count})
                      </span>
                    </label>
                  );
                })}
              </div>

              {labelRow(
                t('quizConfig.types'),
                () => setSelectedTypes(null),
                () => setSelectedTypes([])
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {KVIZ_ALL_TYPES.map((ty) => (
                  <button
                    key={ty}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleType(ty);
                    }}
                    style={chipStyle(checkedTypes.includes(ty))}
                  >
                    {TYPE_BADGES[ty]} {t(`quizType.${ty}`)}
                  </button>
                ))}
              </div>

              <p
                style={{
                  fontSize: '0.75rem',
                  margin: 0,
                  color: available > 0 ? 'var(--text-secondary)' : 'var(--danger)',
                }}
              >
                {available > 0
                  ? t('quizConfig.available', { n: available })
                  : t('quizConfig.emptySelection')}
              </p>
            </>
          )}

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
              alignSelf: 'center',
            }}
          >
            {t('import.importQuestions')}
          </button>
        </>
      )}

      {error && (
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--danger)',
            margin: 0,
            maxWidth: '260px',
            alignSelf: 'center',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
