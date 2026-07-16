import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KVIZ_CATEGORIES,
  kvizCategory,
  normalizeEmojiAnswer,
  parseQuizImport,
} from '@igra/shared';
import type { KvizQuestionType } from '@igra/shared';
import {
  KVIZ_ALL_TYPES,
  availableQuestionCount,
  effectivePackIds,
  useQuizImportStore,
} from '../store/quizImportStore';
import type { QuizPackSummary } from '../store/quizImportStore';
import { getRecentPackIds } from '../store/quizRecentStore';
import { useT } from '../i18n/useT';

const TYPE_BADGES: Record<KvizQuestionType, string> = {
  obicno: '❓',
  geo: '🗺️',
  broj: '🔢',
  audio: '🎵',
  video: '🎬',
  emoji: '😀',
};

const RECENT_SHOWN = 6;

/**
 * Kviz question-source picker: a multi-select of server packs grouped by
 * category (with search + a "recently used" strip), a question-type filter,
 * or a local .json file inlined as customQuestions. The built-in bank arrives
 * as the '__bank__' pseudo-pack from /api/question-packs.
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
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const q = normalizeEmojiAnswer(search);
  const matches = (p: QuizPackSummary) =>
    !q ||
    normalizeEmojiAnswer(p.name).includes(q) ||
    normalizeEmojiAnswer(p.description ?? '').includes(q);

  // Packs grouped by category, in KVIZ_CATEGORIES order, empty groups dropped.
  const groups = useMemo(() => {
    const visible = packs.filter(matches);
    return KVIZ_CATEGORIES.map((cat) => ({
      cat,
      items: visible.filter((p) => kvizCategory(p.category).id === cat.id),
    })).filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs, q]);

  const recent = useMemo(() => {
    if (q) return [];
    const byId = new Map(packs.map((p) => [p.id, p]));
    return getRecentPackIds()
      .map((id) => byId.get(id))
      .filter((p): p is QuizPackSummary => !!p)
      .slice(0, RECENT_SHOWN);
  }, [packs, q]);

  const setPacksChecked = (ids: string[], on: boolean) => {
    const cur = new Set(checkedIds);
    ids.forEach((id) => (on ? cur.add(id) : cur.delete(id)));
    const next = [...cur];
    setSelectedPackIds(next.length === packs.length ? null : next);
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('quizConfig.search')}
                style={{
                  padding: '0.4rem 0.6rem',
                  fontSize: '0.8rem',
                  borderRadius: '8px',
                  border: '1px solid var(--line2)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />

              {/* Recently used */}
              {recent.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--dim)', fontWeight: 700, textAlign: 'left' }}>
                    🕘 {t('quizConfig.recent')}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {recent.map((p) => {
                      const on = checkedIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePack(p.id);
                          }}
                          style={chipStyle(on)}
                        >
                          {on ? '✓ ' : ''}
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Global bulk select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--dim)', fontWeight: 700, textAlign: 'left' }}>
                  {t('quizConfig.packs')}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setSelectedPackIds(null); }} style={bulkBtnStyle}>
                  {t('quizConfig.selectAll')}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setSelectedPackIds([]); }} style={bulkBtnStyle}>
                  {t('quizConfig.selectNone')}
                </button>
              </div>

              {/* Grouped, collapsible category sections */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.15rem',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  textAlign: 'left',
                }}
              >
                {groups.length === 0 && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>
                    {t('quizConfig.noResults', { q: search })}
                  </span>
                )}
                {groups.map(({ cat, items }) => {
                  const ids = items.map((p) => p.id);
                  const selInSection = ids.filter((id) => checkedIds.includes(id)).length;
                  const allOn = selInSection === ids.length;
                  const isCollapsed = collapsed.has(cat.id);
                  return (
                    <div key={cat.id}>
                      <div
                        onClick={() => toggleCollapse(cat.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          cursor: 'pointer',
                          padding: '0.3rem 0',
                        }}
                      >
                        <span style={{ fontSize: '0.6rem', color: 'var(--dim)', width: '10px' }}>
                          {isCollapsed ? '▸' : '▾'}
                        </span>
                        <span style={{ flex: 1, fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                          {cat.icon} {cat.label}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--dim)' }}>
                          {selInSection}/{ids.length}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPacksChecked(ids, !allOn);
                          }}
                          style={bulkBtnStyle}
                        >
                          {t('quizConfig.selectAll')}
                        </button>
                      </div>
                      {!isCollapsed &&
                        items.map((p) => {
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
                                padding: '0.12rem 0 0.12rem 1.1rem',
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
                  );
                })}
              </div>

              {/* Type filter (kept below the category groups) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--dim)', fontWeight: 700, textAlign: 'left' }}>
                  {t('quizConfig.types')}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setSelectedTypes(null); }} style={bulkBtnStyle}>
                  {t('quizConfig.selectAll')}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setSelectedTypes([]); }} style={bulkBtnStyle}>
                  {t('quizConfig.selectNone')}
                </button>
              </div>
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

              {/* Footer: selected summary + clear */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.1rem' }}>
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.75rem',
                    color: available > 0 ? 'var(--text-secondary)' : 'var(--danger)',
                  }}
                >
                  {available > 0
                    ? t('quizConfig.selectedSummary', { packs: checkedIds.length, questions: available })
                    : t('quizConfig.emptySelection')}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setSelectedPackIds([]); }} style={bulkBtnStyle}>
                  {t('quizConfig.clear')}
                </button>
              </div>
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
