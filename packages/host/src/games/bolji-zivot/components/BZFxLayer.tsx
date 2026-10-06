import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BZMove, BZMoveEndpoint, BZCardInfo } from '@igra/shared';
import { bzEmojiFor } from '@igra/shared';

// FX sloj za Zavet: "flight" animacije karata (server šalje strukturisan
// data.lastMove) + blesak Groma + Zduhać štit. Krajnje tačke leta se traže
// preko DOM sidara data-bz-anchor ('deck', 'discard', 'hand:<id>',
// 'slot:<id>:<pos>'); sidro koje trenutno nije na ekranu tiho preskačemo.
// Identična kopija živi u host i controller paketu (kao BZCard).
//
// Zašto je let ovakav: novo stanje stiže odjednom, pa se odredište (karta u
// ruci, novi vrh otpada, dirnuti slot) nacrta ODMAH — ako bi duh-karta samo
// bledo preletela preko, oko bi videlo kartu već na cilju i let bi delovao
// kao teleport. Zato je duh neproziran celim putem, kreće od veličine izvora
// i stiže u veličini cilja, a samo odredište je sakriveno dok karta ne sleti
// i onda se "spusti" na mesto.

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

function anchorEl(ep: BZMoveEndpoint): HTMLElement | null {
  return document.querySelector<HTMLElement>(anchorSelector(ep));
}

/**
 * Pravougaonik same KARTE u sidru. Sidro je ponekad veće od karte (otpad sa
 * natpisom ispod, cela porodica kao "ruka" na TV-u).
 */
function cardRect(el: HTMLElement, ref: DOMRect | null): DOMRect {
  const inner = el.matches('[data-bz-card]') ? el : el.querySelector<HTMLElement>('[data-bz-card]');
  const r = el.getBoundingClientRect();
  // Jedna karta u sidru (slot, otpad, ruka na telefonu) — tačno njen okvir.
  // Cela porodica kao "ruka" na TV-u ima više karata, pa tamo uzimamo
  // kartu veličine špila na sredini kutije.
  if (inner && el.querySelectorAll('[data-bz-card]').length <= 1) return inner.getBoundingClientRect();
  if (r.width < 130 && r.height < 190) return r;
  const w = ref?.width ?? 56;
  const h = ref?.height ?? w * 1.4;
  return new DOMRect(r.left + r.width / 2 - w / 2, r.top + r.height / 2 - h / 2, w, h);
}

interface Flight {
  key: string;
  from: DOMRect;
  to: DOMRect;
  face?: BZCardInfo;
  delayMs: number;
}

const FLIGHT_MS = 620;
const STEP_STAGGER_MS = 170;
const LAND_MS = 240;

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** ease-in-out, da karta krene i stane meko */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grom: blesak preko celog ekrana na ulazak u racija-show.
  useEffect(() => {
    if (phase === 'racija-show' && prevPhase.current !== 'racija-show') {
      setFlashTick((n) => n + 1);
    }
    prevPhase.current = phase;
  }, [phase]);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    []
  );

  useEffect(() => {
    // Svako novo stanje donosi nov objekat lastMove — animiramo samo nov id.
    if (!move || move.id === lastMoveId.current) return;
    lastMoveId.current = move.id;
    if (move.kind === 'zduhac-block') setShieldTick((n) => n + 1);

    const reduced = reducedMotion();
    const deck = anchorEl({ type: 'deck' });
    const ref = deck ? deck.getBoundingClientRect() : null;
    const fs: Flight[] = [];
    move.steps.forEach((s, i) => {
      // Ruka koja više nije na ekranu (posle zamene se odmah skloni) — karta
      // tada kreće od špila, vizuelnog centra stola. Ali cilj koji ne
      // postoji preskačemo: let od špila do špila bi bio samo treptaj.
      const fromEl = anchorEl(s.from) ?? (s.from.type === 'hand' ? deck : null);
      const toEl = anchorEl(s.to);
      if (!fromEl || !toEl || fromEl === toEl) return;
      const delayMs = fs.length * STEP_STAGGER_MS;
      fs.push({
        key: `${move.id}-${i}`,
        from: cardRect(fromEl, ref),
        to: cardRect(toEl, ref),
        face: s.face,
        delayMs,
      });
      if (reduced) return;
      // Odredište sa jednom kartom (slot, otpad, ruka na telefonu) čeka da
      // karta stigne, pa se spusti na mesto. Celu porodicu kao "ruku" na
      // TV-u ne sakrivamo — tu karta samo sleti na sredinu kutije.
      if (toEl.querySelectorAll('[data-bz-card]').length > 1) return;
      const landAt = delayMs + FLIGHT_MS;
      toEl.animate([{ opacity: 0 }, { opacity: 0 }], { duration: landAt, fill: 'none' });
      toEl.animate(
        [
          { transform: 'scale(1.1)', offset: 0 },
          { transform: 'scale(0.96)', offset: 0.6 },
          { transform: 'scale(1)' },
        ],
        { duration: LAND_MS, delay: landAt, easing: 'ease-out' }
      );
    });
    if (reduced || fs.length === 0) return;
    setFlights(fs);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(
      () => setFlights([]),
      FLIGHT_MS + fs.length * STEP_STAGGER_MS + 100
    );
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
    const fx = f.from.left + f.from.width / 2;
    const fy = f.from.top + f.from.height / 2;
    const tx = f.to.left + f.to.width / 2;
    const ty = f.to.top + f.to.height / 2;
    const dx = tx - fx;
    const dy = ty - fy;
    const dist = Math.hypot(dx, dy);
    const endScale = f.to.width / f.from.width;
    // Luk: kontrolna tačka iznad sredine puta, karta se "podigne" sa stola.
    const lift = Math.min(90, 26 + dist * 0.22);
    const cx = dx / 2;
    const cy = dy / 2 - lift;
    // Blagi nagib u smeru kretanja, vraća se na nulu pri sletanju.
    const tilt = Math.max(-14, Math.min(14, dx * 0.04));

    // Uzorkujemo bezijer u ~13 tačaka — WAAPI onda glatko interpolira između
    // njih, a sama putanja je kriva, ne prava linija.
    const frames: Keyframe[] = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const t = ease(i / N);
      const u = 1 - t;
      const x = 2 * u * t * cx + t * t * dx;
      const y = 2 * u * t * cy + t * t * dy;
      const s = 1 + (endScale - 1) * t + 0.14 * Math.sin(Math.PI * t);
      const rot = tilt * Math.sin(Math.PI * t);
      const shadow = 8 + 18 * Math.sin(Math.PI * t);
      frames.push({
        offset: i / N,
        transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${s})`,
        boxShadow: `0 ${shadow}px ${shadow * 1.6}px rgba(0,0,0,0.45)`,
      });
    }
    el.animate(frames, {
      duration: FLIGHT_MS,
      delay: f.delayMs,
      easing: 'linear',
      fill: 'both',
    });
  }, [f]);

  const w = f.from.width;
  const h = f.from.height;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: f.from.left,
        top: f.from.top,
        width: w,
        height: h,
        transformOrigin: '50% 50%',
        borderRadius: w * 0.14,
        background: f.face
          ? 'var(--bg-card, #1D3557)'
          : 'linear-gradient(135deg, var(--bg-secondary, #162E4E) 0%, var(--bg-card, #1D3557) 100%)',
        border: '2px solid rgba(194,155,71,0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        willChange: 'transform',
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
