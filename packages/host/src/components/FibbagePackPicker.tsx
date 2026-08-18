import { useEffect } from 'react';
import {
  useFibbageConfigStore,
  effectiveFibbagePackIds,
  fibbageCategoriesOf,
  fibbageQuestionCount,
  type FibbagePackSummary,
} from '../store/fibbageConfigStore';

/**
 * Lažov question-pack picker for the game-select screen.
 *
 * The list comes from `GET /api/fibbage-packs`, which serves **summaries
 * only** — a Lažov manifest carries the answers, so nothing but ids and
 * counts reaches this screen (the TV is a public display). Only the chosen
 * ids ride `host:start-game`.
 *
 * Renders nothing when the server has no valid pack: the game then falls back
 * to the built-in bank on its own, so an empty picker would be a dead control.
 */
export function FibbagePackPicker() {
  const {
    packs,
    packsLoaded,
    selectedPackIds,
    selectedCategories,
    setPacks,
    setSelectedPackIds,
    setSelectedCategories,
  } = useFibbageConfigStore();

  useEffect(() => {
    if (packsLoaded) return;
    let cancelled = false;
    fetch('/api/fibbage-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: FibbagePackSummary[] }) => {
        if (!cancelled) setPacks(data.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setPacks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [packsLoaded, setPacks]);

  if (!packsLoaded || packs.length === 0) return null;

  const activeIds = effectiveFibbagePackIds(packs, selectedPackIds);
  const categories = fibbageCategoriesOf(packs, selectedPackIds);
  const total = fibbageQuestionCount(packs, selectedPackIds);

  const togglePack = (id: string) => {
    const cur = new Set(activeIds);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    // Everything checked collapses back to null so later-added packs join in.
    setSelectedPackIds(cur.size === packs.length ? null : [...cur]);
  };

  const toggleCategory = (cat: string) => {
    const cur = new Set(selectedCategories ?? categories);
    if (cur.has(cat)) cur.delete(cat);
    else cur.add(cat);
    setSelectedCategories(
      cur.size === categories.length || cur.size === 0 ? null : [...cur]
    );
  };

  const activeCats = selectedCategories ?? categories;

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

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    color: 'var(--dim)',
    fontWeight: 700,
    textAlign: 'left',
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <span style={labelStyle}>Paketi pitanja</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {packs.map((p) => {
          const on = activeIds.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => togglePack(p.id)}
              style={chipStyle(on)}
              title={p.description}
            >
              {on ? '✓ ' : ''}
              {p.name} ({p.count})
            </button>
          );
        })}
      </div>

      {categories.length > 1 && (
        <>
          <span style={labelStyle}>Kategorije</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            {categories.map((c) => {
              const on = activeCats.includes(c);
              return (
                <button key={c} onClick={() => toggleCategory(c)} style={chipStyle(on)}>
                  {on ? '✓ ' : ''}
                  {c}
                </button>
              );
            })}
          </div>
        </>
      )}

      <span style={{ ...labelStyle, color: activeIds.length === 0 ? 'var(--danger)' : 'var(--dim)' }}>
        {activeIds.length === 0
          ? 'Izaberi bar jedan paket.'
          : `${total} pitanja u izboru${
              selectedCategories ? ' (pre filtera kategorija)' : ''
            }`}
      </span>
    </div>
  );
}
