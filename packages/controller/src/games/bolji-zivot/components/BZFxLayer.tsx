import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BZMove, BZMoveEndpoint, BZCardInfo } from '@igra/shared';
import { bzEmojiFor } from '@igra/shared';

// FX sloj za Zavet: "flight" animacije karata (server šalje strukturisan
// data.lastMove) + blesak Groma + Zduhać štit. Krajnje tačke leta se traže
// preko DOM sidara data-bz-anchor ('deck', 'discard', 'hand:<id>',
// 'slot:<id>:<pos>'); sidro koje trenutno nije na ekranu tiho preskačemo.
// Identična kopija živi u host i controller paketu (kao BZCard).

function anchorSelector(ep: BZMoveEndpoint): string {
  switch (ep.type) {
    case 'deck':
      return '[data-bz-anchor="deck"]';
    case 'discard':
      return '[data-bz-anchor="discard"]';
    case 'hand':
      return `[data-bz-anchor="hand:${ep.playerId}"]`;
    case 'slot':
      return `[data-bz-anchor="slot:${ep.playerId}:${ep.pos}"]`;
  }
}

function anchorRect(ep: BZMoveEndpoint): DOMRect | null {
  const el = document.querySelector(anchorSelector(ep));
  if (el) return el.getBoundingClientRect();
  // "Ruka" često nestane iz DOM-a u istom trenutku kad i potez (npr. posle
  // zamene se holding prikaz odmah skloni) — let tada kreće od špila,
  // vizuelno centra stola, umesto da se ceo korak preskoči.
  if (ep.type === 'hand') {
    const deck = document.querySelector('[data-bz-anchor="deck"]');
    if (deck) return deck.getBoundingClientRect();
  }
  return null;
}

interface Flight {
  key: string;
  from: DOMRect;
  to: DOMRect;
  face?: BZCardInfo;
  delayMs: number;
  shield: boolean;
}

const FLIGHT_MS = 650;
const STEP_STAGGER_MS = 140;

export function BZFxLayer({
  move,
  phase,
}: {
  move: BZMove | null;
  phase: string;
}) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [shieldTick, setShieldTick] = useState(0);
  const [flashTick, setFlashTick] = useState(0);
  const lastMoveId = useRef(0);
  const prevPhase = useRef('');

  // Grom: blesak preko celog ekrana na ulazak u racija-show.
  useEffect(() => {
    if (phase === 'racija-show' && prevPhase.current !== 'racija-show') {
      setFlashTick((n) => n + 1);
    }
    prevPhase.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!move || move.id === lastMoveId.current) return;
    lastMoveId.current = move.id;
    const fs: Flight[] = [];
    move.steps.forEach((s, i) => {
      const from = anchorRect(s.from);
      const to = anchorRect(s.to);
      if (!from || !to) return;
      fs.push({
        key: `${move.id}-${i}`,
        from,
        to,
        face: s.face,
        delayMs: i * STEP_STAGGER_MS,
        shield: move.kind === 'zduhac-block' && i === 0,
      });
    });
    if (move.kind === 'zduhac-block') setShieldTick((n) => n + 1);
    if (fs.length === 0) return;
    setFlights(fs);
    const t = setTimeout(
      () => setFlights([]),
      FLIGHT_MS + fs.length * STEP_STAGGER_MS + 150
    );
    return () => clearTimeout(t);
  }, [move]);

  if (flights.length === 0 && shieldTick === 0 && flashTick === 0) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 90,
        overflow: 'hidden',
      }}
    >
      {flashTick > 0 && (
        <div
          key={`flash-${flashTick}`}
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.9) 48%, rgba(194,155,71,0.8) 52%, transparent 80%)',
            animation: 'bz-flash 0.7s ease-out both',
          }}
        />
      )}
      {shieldTick > 0 && (
        <div
          key={`shield-${shieldTick}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '45%',
            transform: 'translate(-50%, -50%)',
            fontSize: '5rem',
            animation: 'bz-shield-pop 0.9s ease-out both',
            filter: 'drop-shadow(0 0 18px rgba(194,155,71,0.9))',
          }}
        >
          🛡️
        </div>
      )}
      {flights.map((f) => (
        <FlightCard key={f.key} f={f} />
      ))}
    </div>,
    document.body
  );
}

function FlightCard({ f }: { f: Flight }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dx =
      f.to.left + f.to.width / 2 - (f.from.left + f.from.width / 2);
    const dy = f.to.top + f.to.height / 2 - (f.from.top + f.from.height / 2);
    el.animate(
      [
        { transform: 'translate(0px, 0px) scale(0.9)', opacity: 0 },
        {
          transform: `translate(${dx * 0.15}px, ${dy * 0.15}px) scale(1.15)`,
          opacity: 1,
          offset: 0.2,
        },
        {
          transform: `translate(${dx * 0.85}px, ${dy * 0.85}px) scale(1.15)`,
          opacity: 1,
          offset: 0.8,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(0.95)`, opacity: 0 },
      ],
      {
        duration: FLIGHT_MS,
        delay: f.delayMs,
        easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)',
        fill: 'both',
      }
    );
  }, [f]);

  // Veličina duh-karte prati manje od dva sidra, uz razumne granice.
  const w = Math.max(34, Math.min(f.from.width, f.to.width, 64));
  const h = w * 1.4;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: f.from.left + f.from.width / 2 - w / 2,
        top: f.from.top + f.from.height / 2 - h / 2,
        width: w,
        height: h,
        borderRadius: w * 0.14,
        background:
          'linear-gradient(135deg, var(--bg-secondary, #162E4E) 0%, var(--bg-card, #1D3557) 100%)',
        border: '2px solid rgba(194,155,71,0.7)',
        boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        opacity: 0,
      }}
    >
      {f.face ? (
        <>
          <span style={{ fontSize: w * 0.42, lineHeight: 1 }}>
            {bzEmojiFor(f.face.v, f.face.name)}
          </span>
          <span
            style={{
              fontSize: w * 0.3,
              fontWeight: 800,
              color: 'var(--accent, #C29B47)',
              lineHeight: 1,
            }}
          >
            {f.face.v}
          </span>
        </>
      ) : (
        <span style={{ fontSize: w * 0.45, lineHeight: 1 }}>🧿</span>
      )}
    </div>
  );
}
