import { useMemo, useState } from 'react';
import type { BitkaMapView as BitkaMapData, BitkaPlayerView, BitkaTerritoryState } from '@igra/shared';

const NEUTRAL = '#8a91a2';

interface BitkaMapViewProps {
  map: BitkaMapData;
  board: BitkaTerritoryState[];
  players: BitkaPlayerView[];
  /** Teritorije koje se trenutno mogu izabrati — svetle isprekidanom zlatnom. */
  highlightIds?: string[];
  /** Meta tekućeg napada — jaka zlatna kontura i pulsiranje. */
  focusId?: string | null;
  /** Ko je na potezu — njegov zamak se uveća, da se vidi ko trenutno igra. */
  activePlayerId?: string | null;
  maxHeightCss?: string;
  /** Ispisuj imena teritorija (na telefonu se guši, na TV-u ne). */
  showNames?: boolean;
  /**
   * Sloj preko mape, u istoj kutiji i istim [0,1] koordinatama — tu ide FX
   * platno. Namerno `children`, a ne `fx` prop: mapa ne zna za three.js.
   */
  children?: React.ReactNode;
}

/**
 * Mapa sa obojenim teritorijama. Mapa je ilustracija, pa se popuna drži
 * poluprovidnom uz jaku belu konturu — vlasništvo se čita, a crtež ispod
 * ostaje vidljiv. Sve koordinate su normalizovane [0,1], isto kao kod kviz
 * geo pinova, pa se koristi isti wrapper sa zaključanim odnosom stranica.
 */
export function BitkaMapView({
  map,
  board,
  players,
  highlightIds,
  focusId,
  activePlayerId,
  maxHeightCss = '62vh',
  showNames = true,
  children,
}: BitkaMapViewProps) {
  // Odnos stranica se meri iz same slike — mape su različitih dimenzija.
  const [ratio, setRatio] = useState<number>(3 / 2);

  const ownerColor = useMemo(() => {
    const byId = new Map(players.map((p) => [p.playerId, p.avatarColor]));
    return (playerId: string | null) => (playerId ? (byId.get(playerId) ?? NEUTRAL) : NEUTRAL);
  }, [players]);
  const ownerEmoji = useMemo(() => {
    const byId = new Map(players.map((p) => [p.playerId, p.avatarEmoji]));
    return (playerId: string | null) => (playerId ? (byId.get(playerId) ?? '') : '');
  }, [players]);

  const stateById = useMemo(
    () => new Map(board.map((st) => [st.id, st])),
    [board]
  );
  const highlight = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);

  return (
    <div
      style={{
        position: 'relative',
        width: `min(100%, calc(${maxHeightCss} * ${ratio}))`,
        aspectRatio: `${ratio}`,
        margin: '0 auto',
        background: '#0B1728',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
      }}
    >
      <img
        src={map.imageUrl}
        alt={map.name}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {map.territories.map((t) => {
          const st = stateById.get(t.id);
          const owned = !!st?.ownerId;
          const isFocus = focusId === t.id;
          const isPick = highlight.has(t.id);
          return (
            <polygon
              key={t.id}
              points={t.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={ownerColor(st?.ownerId ?? null)}
              fillOpacity={owned ? (isFocus ? 0.62 : 0.45) : isPick ? 0.42 : 0.16}
              stroke={isFocus ? '#F2CE74' : isPick ? '#F2CE74' : 'rgba(255,255,255,0.9)'}
              strokeWidth={isFocus ? 5 : isPick ? 6 : 2}
              strokeDasharray={isPick && !isFocus ? '10 6' : undefined}
              vectorEffect="non-scaling-stroke"
              // Ponuda pulsira kroz klasu, da je `prefers-reduced-motion`
              // može zameniti mirnom debljom konturom.
              className={isPick && !isFocus ? 'bitka-ponuda' : undefined}
              style={isFocus ? { animation: 'igra-pop 0.5s ease-out' } : undefined}
            />
          );
        })}
      </svg>

      {map.territories.map((t) => {
        const st = stateById.get(t.id);
        const castle = st?.castle && (st?.walls ?? 0) > 0;
        const activeCastle = castle && !!activePlayerId && st?.ownerId === activePlayerId;
        const emoji = castle ? ownerEmoji(st?.ownerId ?? null) : '';
        return (
          <div
            key={t.id}
            style={{
              position: 'absolute',
              left: `${t.label.x * 100}%`,
              top: `${t.label.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            {/* Čiji je zamak — avatar iznad kule, isto kao sprajt na 3D tabli. */}
            {emoji && (
              <div
                style={{
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '50%',
                  background: 'rgba(9,20,36,0.78)',
                  border: '2px solid #F2CE74',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.85rem',
                  lineHeight: 1,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.7)',
                }}
              >
                {emoji}
              </div>
            )}
            {castle && (
              <div
                style={{
                  fontSize: activeCastle ? '2.4rem' : '1.6rem',
                  lineHeight: 1,
                  transition: 'font-size 0.25s',
                  filter: activeCastle
                    ? 'drop-shadow(0 0 10px rgba(242,206,116,0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.8))'
                    : 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
                }}
              >
                🏰
              </div>
            )}
            {castle && (
              <div style={{ display: 'flex', gap: '3px' }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '2px',
                      background: i < (st?.walls ?? 0) ? '#F2CE74' : 'rgba(255,255,255,0.22)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.7)',
                    }}
                  />
                ))}
              </div>
            )}
            {showNames && (
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: '#fff',
                  textShadow: '0 1px 4px rgba(0,0,0,0.95)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.name}
              </div>
            )}
          </div>
        );
      })}

      {/* Efekti idu iznad imena i zamkova — udar ne sme da bude zaklonjen. */}
      {children}
    </div>
  );
}
