import { useEffect, useState } from 'react';
import { useGeoConfigStore } from '../store/geoConfigStore';

interface GeoPackSummary {
  id: string;
  fileName: string;
  name: string;
  description?: string;
  count: number;
}

const PHOTO_OPTIONS = [1, 2, 3, 4];

export function GeoPackButton() {
  const {
    mode,
    selectedPackId,
    customPhotosPerPlayer,
    setMode,
    setSelectedPackId,
    setCustomPhotosPerPlayer,
  } = useGeoConfigStore();
  const [packs, setPacks] = useState<GeoPackSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/geo-packs')
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((data: { packs?: GeoPackSummary[] }) => {
        if (cancelled) return;
        const list = data.packs ?? [];
        setPacks(list);
        // If nothing selected yet, autoselect the first pack.
        if (!selectedPackId && list.length > 0) {
          setSelectedPackId(list[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setPacks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = (e: React.MouseEvent | React.ChangeEvent) => e.stopPropagation();

  return (
    <div
      onClick={stop}
      style={{
        marginTop: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.35rem' }}>
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

      {/* Pack selector — only in predefined mode */}
      {mode === 'predefined' && (
        <>
          {loading ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Učitavanje paketa…
            </span>
          ) : packs.length === 0 ? (
            <span style={{ fontSize: '0.75rem', color: '#e74c3c' }}>
              Nema dostupnih paketa
            </span>
          ) : (
            <select
              value={selectedPackId ?? ''}
              onChange={(e) => {
                e.stopPropagation();
                setSelectedPackId(e.target.value || null);
              }}
              onClick={stop}
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
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
          )}
        </>
      )}

      {/* Photos-per-player stepper — only in custom mode */}
      {mode === 'custom' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Slika po igraču
          </span>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {PHOTO_OPTIONS.map((n) => {
              const active = n === customPhotosPerPlayer;
              return (
                <button
                  key={n}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomPhotosPerPlayer(n);
                  }}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    background: active ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: active ? '#fff' : 'var(--text-primary)',
                    minWidth: '36px',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        padding: '0.4rem 0.85rem',
        fontSize: '0.8rem',
        fontWeight: 700,
        borderRadius: '6px',
        background: active ? 'var(--accent)' : 'var(--bg-secondary)',
        color: active ? '#fff' : 'var(--text-primary)',
        border: '1px solid var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}
