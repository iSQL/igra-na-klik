import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BitkaFxEvent,
  BitkaMapView,
  BitkaPlayerView,
  BitkaTerritoryState,
} from '@igra/shared';
import { planFxTiming, pointInPolygon } from '@igra/shared';

const NEUTRAL = '#8a91a2';
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
/** Pomeraj (u CSS px) preko kog se dodir tumači kao prevlačenje, ne kao tap. */
const TAP_THRESHOLD = 8;

interface SinglePointerStart {
  x: number;
  y: number;
  panAtStart: { x: number; y: number };
  moved: boolean;
}

interface PinchStart {
  midpoint: { x: number; y: number };
  distance: number;
  zoomAtStart: number;
  panAtStart: { x: number; y: number };
}

interface BitkaMapPickerProps {
  map: BitkaMapView;
  board: BitkaTerritoryState[];
  players: BitkaPlayerView[];
  /** Teritorije koje se smeju tapnuti; prazno = mapa je samo za gledanje. */
  selectableIds?: string[];
  selectedId?: string | null;
  focusId?: string | null;
  /** Ko je na potezu — njegov zamak pulsira, da se vidi ko trenutno igra. */
  activePlayerId?: string | null;
  onSelect?: (territoryId: string) => void;
  /**
   * Popuni sav prostor koji roditelj da (roditelj mora biti flex sa
   * `flex:1; minHeight:0`). Meri se kutija, jer se od `aspect-ratio` i
   * `max-height` u CSS-u širina ne preračunava nazad — mapa bi ostala
   * uska ili bi prelila.
   */
  fill?: boolean;
  maxHeightCss?: string;
  /**
   * Događaji sa mape — teritorija koja je promenila vlasnika ili primila udar
   * kratko blesne. Telefon nema 3D teren kao TV, ali ni tiha promena boje nije
   * dovoljna: bez odjeka se ne primeti da se nešto uopšte desilo.
   */
  fxEvents?: BitkaFxEvent[];
}

/** Koliko blesak traje — mora da se poklopi sa CSS animacijama. */
const FLASH_MS: Record<string, number> = {
  osvojeno: 1600,
  zid: 2100,
  'zamak-pao': 2100,
  default: 900,
};

/**
 * Mapa na telefonu — tap bira teritoriju, dva prsta zumiraju, prevlačenje
 * pomera kad je zumirano.
 *
 * Gesture matematika je ista kao kod kviz geo mape (ista normalizovana [0,1]
 * osnova); jedina razlika je što se umesto pina radi **pogodak u poligon** nad
 * istim koordinatama. Ispod mape stoji i lista dugmadi — mapa je lepa, ali
 * lista je ta koja garantuje precizan izbor na malom ekranu.
 */
export function BitkaMapPicker({
  map,
  board,
  players,
  selectableIds,
  selectedId,
  focusId,
  activePlayerId,
  onSelect,
  fill,
  maxHeightCss = '46dvh',
  fxEvents,
}: BitkaMapPickerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ratio, setRatio] = useState(3 / 2);

  useEffect(() => {
    if (!fill) return;
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fill]);

  // Bleskovi: teritorija → boja. Ključ `nonce` tera SVG da ponovo pokrene
  // animaciju i kad ista teritorija blesne dvaput za redom.
  const [flashes, setFlashes] = useState<
    { id: string; color: string; kind: string; nonce: number }[]
  >([]);
  const playedFxRef = useRef(0);
  useEffect(() => {
    if (!fxEvents?.length) return;
    const fresh = fxEvents.filter((ev) => ev.id > playedFxRef.current && ev.territoryId);
    if (!fresh.length) return;
    playedFxRef.current = fresh[fresh.length - 1].id;

    // Isti raspored u vremenu koji koristi TV: posle pada zamka teritorije se
    // pale jedna za drugom, umesto da cela zemlja tiho promeni boju odjednom.
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const { event, delay } of planFxTiming(fresh)) {
      const flash = {
        id: event.territoryId!,
        color: event.kind === 'zid' || event.kind === 'zamak-pao' ? '#FF9F3D' : event.color,
        kind: event.kind,
        nonce: event.id,
      };
      const life = FLASH_MS[event.kind] ?? FLASH_MS.default;
      timers.push(
        setTimeout(() => {
          setFlashes((prev) => [...prev, flash]);
          timers.push(
            setTimeout(
              () => setFlashes((prev) => prev.filter((f) => f.nonce !== flash.nonce)),
              life
            )
          );
        }, delay * 1000)
      );
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [fxEvents]);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const singleStartRef = useRef<SinglePointerStart | null>(null);
  const pinchStartRef = useRef<PinchStart | null>(null);

  const selectable = useMemo(() => new Set(selectableIds ?? []), [selectableIds]);
  const stateById = useMemo(() => new Map(board.map((st) => [st.id, st])), [board]);
  const ownerColor = useMemo(() => {
    const byId = new Map(players.map((p) => [p.playerId, p.avatarColor]));
    return (playerId: string | null) => (playerId ? (byId.get(playerId) ?? NEUTRAL) : NEUTRAL);
  }, [players]);

  const clampPan = useCallback(
    (next: { x: number; y: number }, currentZoom: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return next;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      return {
        x: Math.min(0, Math.max(w * (1 - currentZoom), next.x)),
        y: Math.min(0, Math.max(h * (1 - currentZoom), next.y)),
      };
    },
    []
  );

  /** Tap → normalizovane koordinate → teritorija ispod prsta. */
  const pickAtClient = useCallback(
    (clientX: number, clientY: number) => {
      if (!onSelect || selectable.size === 0) return;
      const inner = contentRef.current;
      if (!inner) return;
      const rect = inner.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const point = {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
      if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return;
      // Odozgo nadole — poslednje iscrtana teritorija je i vizuelno na vrhu.
      for (let i = map.territories.length - 1; i >= 0; i--) {
        const t = map.territories[i];
        if (!selectable.has(t.id)) continue;
        if (pointInPolygon(point, t.polygon)) {
          onSelect(t.id);
          return;
        }
      }
    },
    [map, onSelect, selectable]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      singleStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panAtStart: { ...pan },
        moved: false,
      };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      pinchStartRef.current = {
        midpoint: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        zoomAtStart: zoom,
        panAtStart: { ...pan },
      };
      if (singleStartRef.current) singleStartRef.current.moved = true;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const newMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const start = pinchStartRef.current;
      const clampedZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, start.zoomAtStart * (newDist / start.distance))
      );

      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const wrapperRect = wrapper.getBoundingClientRect();
      const contentX = (start.midpoint.x - wrapperRect.left - start.panAtStart.x) / start.zoomAtStart;
      const contentY = (start.midpoint.y - wrapperRect.top - start.panAtStart.y) / start.zoomAtStart;
      const nextPan = {
        x: newMid.x - wrapperRect.left - contentX * clampedZoom,
        y: newMid.y - wrapperRect.top - contentY * clampedZoom,
      };
      setZoom(clampedZoom);
      setPan(clampPan(nextPan, clampedZoom));
      return;
    }

    if (pointersRef.current.size === 1 && singleStartRef.current) {
      const dx = e.clientX - singleStartRef.current.x;
      const dy = e.clientY - singleStartRef.current.y;
      if (Math.hypot(dx, dy) > TAP_THRESHOLD) singleStartRef.current.moved = true;
      if (zoom > 1 && singleStartRef.current.moved) {
        setPan(
          clampPan(
            {
              x: singleStartRef.current.panAtStart.x + dx,
              y: singleStartRef.current.panAtStart.y + dy,
            },
            zoom
          )
        );
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);

    if (
      pointersRef.current.size === 0 &&
      singleStartRef.current &&
      !singleStartRef.current.moved &&
      !pinchStartRef.current
    ) {
      pickAtClient(e.clientX, e.clientY);
    }

    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    // Prelaz sa dva prsta na jedan: novo sidro, inače mapa poskoči.
    if (pointersRef.current.size === 1) {
      const [remaining] = Array.from(pointersRef.current.values());
      singleStartRef.current = {
        x: remaining.x,
        y: remaining.y,
        panAtStart: { ...pan },
        moved: true,
      };
    }
    if (pointersRef.current.size === 0) singleStartRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 1) {
      const [remaining] = Array.from(pointersRef.current.values());
      singleStartRef.current = {
        x: remaining.x,
        y: remaining.y,
        panAtStart: { ...pan },
        moved: true,
      };
    }
    if (pointersRef.current.size === 0) singleStartRef.current = null;
  };

  // U `fill` režimu se veličina računa iz izmerene kutije: uzmi ono što je
  // uže — širinu kutije, ili širinu koju dozvoljava njena visina.
  const filled = fill && box.w > 0 && box.h > 0;
  const width = filled ? Math.min(box.w, box.h * ratio) : 0;

  const mapEl = (
    <div
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        position: 'relative',
        width: filled ? `${width}px` : `min(100%, calc(${maxHeightCss} * ${ratio}))`,
        aspectRatio: `${ratio}`,
        margin: '0 auto',
        background: '#0B1728',
        borderRadius: '12px',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div
        ref={contentRef}
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          willChange: 'transform',
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
            objectFit: 'fill',
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
            const isPick = selectable.has(t.id);
            const isSelected = selectedId === t.id;
            const isFocus = focusId === t.id;
            return (
              <polygon
                key={t.id}
                points={t.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={ownerColor(st?.ownerId ?? null)}
                fillOpacity={isSelected ? 0.72 : owned ? 0.45 : isPick ? 0.42 : 0.14}
                stroke={isSelected || isFocus ? '#F2CE74' : isPick ? '#F2CE74' : 'rgba(255,255,255,0.85)'}
                strokeWidth={isSelected || isFocus ? 4 : isPick ? 5 : 1.5}
                strokeDasharray={isPick && !isSelected && !isFocus ? '8 5' : undefined}
                vectorEffect="non-scaling-stroke"
                // Ponuđene teritorije dišu — na malom ekranu se isprekidana
                // linija sama po sebi lako izgubi u crtežu mape.
                style={
                  isPick && !isSelected && !isFocus
                    ? { animation: 'igra-bitka-ponuda 1.1s ease-in-out infinite' }
                    : undefined
                }
              />
            );
          })}

          {/* Odjek događaja — preko postojećih poligona, pa se ugasi. */}
          {flashes.map((f) => {
            const t = map.territories.find((x) => x.id === f.id);
            if (!t) return null;
            return (
              <polygon
                key={`${f.id}:${f.nonce}`}
                className={
                  f.kind === 'osvojeno'
                    ? 'bitka-flash bitka-flash-osvojeno'
                    : f.kind === 'zid' || f.kind === 'zamak-pao'
                      ? 'bitka-flash bitka-flash-vatra'
                      : 'bitka-flash'
                }
                points={t.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={f.color}
                stroke={f.color}
                strokeWidth={5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* Vatra nad teritorijom kad padne zid ili zamak. TV to crta u three.js
            sceni koju telefon namerno ne učitava, pa je ovde ista ideja kroz
            CSS: nekoliko plamenova koji se dižu, trepere i gase se. Stoji u
            istom sloju kao zamkovi, pa se zumira i pomera zajedno sa mapom. */}
        {flashes
          .filter((f) => f.kind === 'zid' || f.kind === 'zamak-pao')
          .map((f) => {
            const t = map.territories.find((x) => x.id === f.id);
            if (!t) return null;
            const big = f.kind === 'zamak-pao';
            return (
              <div
                key={`vatra:${f.nonce}`}
                className="bitka-fire"
                style={{
                  left: `${t.label.x * 100}%`,
                  top: `${t.label.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${big ? 1.6 : 1})`,
                }}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="bitka-fire-flame"
                    style={{
                      left: `${(i - 2) * 7}px`,
                      animationDelay: `${i * 0.13}s`,
                      animationDuration: `${0.85 + (i % 3) * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            );
          })}

        {map.territories.map((t) => {
          const st = stateById.get(t.id);
          if (!st?.castle || st.walls <= 0) return null;
          const active = !!activePlayerId && st.ownerId === activePlayerId;
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
                lineHeight: 1,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))',
              }}
            >
              <span
                className={active ? 'bitka-castle-active' : undefined}
                style={{
                  fontSize: active ? '1.4rem' : '1.1rem',
                  display: 'inline-block',
                  lineHeight: 1,
                }}
              >
                🏰
              </span>
              {/* Koliko je zidova ostalo mora da se vidi i na telefonu —
                  bez toga se ne zna koliko je zamak blizu pada. */}
              <span style={{ display: 'flex', gap: '2px' }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '1px',
                      boxSizing: 'border-box',
                      background: i < st.walls ? '#F2CE74' : 'transparent',
                      border: i < st.walls ? 'none' : '1px solid rgba(255,255,255,0.6)',
                    }}
                  />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      {zoom > 1.01 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            padding: '6px 10px',
            fontSize: '0.85rem',
            fontWeight: 700,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
          }}
          aria-label="Resetuj prikaz"
        >
          ↻
        </button>
      )}
    </div>
  );

  if (!fill) return mapEl;
  return (
    <div
      ref={boxRef}
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {filled ? mapEl : null}
    </div>
  );
}
