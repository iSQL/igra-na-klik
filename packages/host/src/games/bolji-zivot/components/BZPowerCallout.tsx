import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BoljiZivotHostData, BoljiZivotPowerKind, BZReactionPublic } from '@igra/shared';
import { BOLJI_ZIVOT_DECK_DEF, BZ_POWER_CALLOUT, BZ_POWER_TEXT } from '@igra/shared';

// Najava moći za Zavet: kad karta sa moći (5–9) padne na otpad i aktivira
// se, SVI za stolom (TV i svaki telefon) na par sekundi vide koja je karta,
// ko ju je bacio i šta radi. Prvi put kad se neka moć pojavi na uređaju ide
// i duže objašnjenje (pamti se u localStorage). Na telefonu stiže i lična
// posledica — kad je moć dirnula baš tvoju kartu.
//
// Sve se izvodi iz javnog stanja (power, reaction, lastMove, racija) — server
// ne šalje ništa novo, pa nema ni curenja: lična poruka kaže samo ono što je
// ionako javno (koja je pozicija dirnuta), nikad koja je karta bila tamo.
// Identična kopija živi u host i controller paketu (kao BZFxLayer).

const SEEN_KEY = 'igra-bz-powers-seen';
const SHORT_MS = 3400;
const FIRST_MS = 6000;
const NOTE_MS = 4800;

function seenPowers(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(kind: string): void {
  try {
    const seen = seenPowers();
    seen.add(kind);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Privatni prozor / blokiran storage — objašnjenje će se samo ponoviti.
  }
}

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function cardOf(v: number) {
  return BOLJI_ZIVOT_DECK_DEF.find((c) => c.v === v && c.power) ?? null;
}

interface Callout {
  id: number;
  kind: BoljiZivotPowerKind;
  v: number;
  actorName: string;
  mine: boolean;
  first: boolean;
}

interface Note {
  id: number;
  emoji: string;
  text: string;
}

export function BZPowerCallout({
  data,
  phase,
  myId,
  size,
}: {
  data: BoljiZivotHostData;
  phase: string;
  /** null na TV-u — tada nema ličnih poruka. */
  myId: string | null;
  size: 'tv' | 'phone';
}) {
  const [callout, setCallout] = useState<Callout | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const seq = useRef(0);
  const lastPowerKey = useRef('');
  const prevPhase = useRef(phase);
  const lastMoveId = useRef(data.lastMove?.id ?? 0);
  // Poslednja ciljana akcija na MOJU kartu — rešava se tek u sledećoj fazi.
  const aimedAtMe = useRef<BZReactionPublic | null>(null);

  const nameOf = (id: string) => data.families.find((f) => f.playerId === id)?.name ?? '?';

  // --- 1 + 3: najava moći -------------------------------------------------
  useEffect(() => {
    const isPower = phase === 'power-select' || phase === 'racija-show';
    if (!isPower) return;
    // Jedna najava po bačenoj karti: broj karata na otpadu je u rundi jedinstven.
    const key = `${data.roundNumber}:${data.discardCount}`;
    if (key === lastPowerKey.current) return;
    lastPowerKey.current = key;

    const kind: BoljiZivotPowerKind = phase === 'racija-show' ? 'raid' : data.power?.kind ?? 'raid';
    const actorId = data.power?.actorId ?? data.currentPlayerId ?? '';
    const first = !seenPowers().has(kind);
    if (first) markSeen(kind);
    setCallout({
      id: ++seq.current,
      kind,
      v: data.power?.v ?? data.discardTop?.v ?? 8,
      actorName: data.power?.actorName ?? data.currentPlayerName ?? '',
      mine: !!myId && actorId === myId,
      first,
    });
  }, [phase, data.roundNumber, data.discardCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout(null), callout.first ? FIRST_MS : SHORT_MS);
    return () => clearTimeout(t);
  }, [callout]);

  // --- 2: lična posledica (samo telefon) ------------------------------------
  useEffect(() => {
    if (!myId) return;
    const say = (emoji: string, text: string) => setNote({ id: ++seq.current, emoji, text });
    const from = prevPhase.current;
    prevPhase.current = phase;

    if (phase === 'reaction' && data.reaction?.targetPlayerId === myId) {
      // Sam Zduhać prozor već kaže "X cilja tvoju kartu" — ovde samo pamtimo.
      aimedAtMe.current = data.reaction;
    }

    const aimed = aimedAtMe.current;
    if (aimed && from === 'reaction' && phase !== 'reaction') {
      const pos = aimed.targetPos + 1;
      if (phase === 'peek-show' && aimed.kind === 'peek-other') {
        say('👁️', `${aimed.actorName} je video tvoju kartu ${pos}. Sada zna šta je tamo.`);
      } else if (phase === 'power-look' && aimed.kind === 'look-swap') {
        say('🧙', `${aimed.actorName} gleda tvoju kartu ${pos} i bira da li će je uzeti…`);
      }
      if (aimed.kind !== 'look-swap' || phase !== 'power-look') aimedAtMe.current = null;
    }
    // Veštica je pogledala i odlučila: zamena stiže kao lastMove (dole);
    // bez zamene karta ostaje — i to vredi reći.
    if (aimed && from === 'power-look' && phase !== 'power-look') {
      const swapped = data.lastMove && data.lastMove.id !== lastMoveId.current && data.lastMove.kind === 'look-swap';
      if (!swapped) say('🧙', `${aimed.actorName} je ostavio tvoju kartu ${aimed.targetPos + 1} na mestu.`);
      aimedAtMe.current = null;
    }

    if (phase === 'racija-show' && from !== 'racija-show') {
      const mine = data.racija?.reveals.filter((r) => r.playerId === myId) ?? [];
      if (mine.length > 0) {
        say('⚡', `Grom je svima pokazao tvoju kartu ${mine.map((r) => r.pos + 1).join(', ')} — od sada je znaju.`);
      }
    }
  }, [phase, data.reaction]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const move = data.lastMove;
    if (!move || move.id === lastMoveId.current) return;
    lastMoveId.current = move.id;
    if (!myId || (move.kind !== 'blind-swap' && move.kind !== 'look-swap')) return;
    // Prvi korak zamene uvek kreće iz akterovog slota.
    const first = move.steps[0]?.from;
    const actorId = first && first.type === 'slot' ? first.playerId : null;
    if (!actorId || actorId === myId) return;
    const hit = move.steps.find((s) => s.to.type === 'slot' && s.to.playerId === myId);
    if (!hit || hit.to.type !== 'slot') return;
    const emoji = move.kind === 'blind-swap' ? '🔄' : '🧙';
    setNote({
      id: ++seq.current,
      emoji,
      text: `${nameOf(actorId)} ti je uzeo kartu ${hit.to.pos + 1} i dao svoju — ono što si pamtio na tom mestu više ne važi.`,
    });
  }, [data.lastMove]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [note]);

  if (!callout && !note) return null;

  const tv = size === 'tv';
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: tv ? '1.2rem' : 'calc(var(--safe-top, 0px) + 0.5rem)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: tv ? '0.7rem' : '0.4rem',
        pointerEvents: 'none',
        zIndex: 95,
        padding: '0 0.75rem',
      }}
    >
      {callout && <CalloutCard key={callout.id} c={callout} tv={tv} />}
      {note && <NoteCard key={note.id} n={note} tv={tv} />}
    </div>,
    document.body
  );
}

/** Ulaz: spusti se odozgo i malo "odskoči"; pri reduced motion samo fade. */
function useEnter(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el?.animate) return;
    if (reducedMotion()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
      return;
    }
    el.animate(
      [
        { opacity: 0, transform: 'translateY(-18px) scale(0.94)' },
        { opacity: 1, transform: 'translateY(2px) scale(1.02)', offset: 0.7 },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' }
    );
  }, [ref]);
}

function CalloutCard({ c, tv }: { c: Callout; tv: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref);
  const card = cardOf(c.v);
  const text = BZ_POWER_CALLOUT[c.kind];
  // Akter na svom telefonu dobija svoju verziju — šta on sada radi.
  // Grom je isti za sve, pa tamo ostaje opšti tekst.
  const own = BZ_POWER_TEXT[c.kind];
  const line =
    c.mine && c.kind !== 'raid'
      ? `Tvoja moć: ${own.charAt(0).toLowerCase()}${own.slice(1)}.`
      : text.short.replace('{a}', c.actorName);
  return (
    <div
      ref={ref}
      role="status"
      style={{
        width: tv ? 'min(46rem, 90vw)' : 'min(26rem, 100%)',
        display: 'flex',
        alignItems: 'center',
        gap: tv ? '1.1rem' : '0.7rem',
        padding: tv ? '0.9rem 1.4rem' : '0.6rem 0.8rem',
        borderRadius: tv ? 22 : 16,
        background: 'rgba(11, 28, 51, 0.94)',
        border: '2px solid var(--accent, #C29B47)',
        boxShadow: '0 12px 34px rgba(0,0,0,0.45)',
        color: 'var(--text-primary, #FAF6F0)',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: tv ? 74 : 48,
          height: tv ? 104 : 67,
          borderRadius: tv ? 12 : 8,
          background: 'var(--bg-card, #274469)',
          border: '2px solid var(--accent, #C29B47)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <span style={{ fontSize: tv ? '2.2rem' : '1.4rem', lineHeight: 1 }}>{card?.emoji ?? '✨'}</span>
        <span style={{ fontSize: tv ? '1.2rem' : '0.85rem', fontWeight: 800, color: 'var(--accent, #C29B47)' }}>
          {c.v}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tv ? 4 : 2, minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: tv ? '1.7rem' : '1.08rem',
            lineHeight: 1.1,
          }}
        >
          ⚡ {card?.name ?? 'Moć'}
          {!c.mine && c.kind !== 'raid' && (
            <span style={{ fontWeight: 600, color: 'var(--text-secondary, #C9C2B3)' }}> · {c.actorName}</span>
          )}
        </span>
        <span style={{ fontSize: tv ? '1.25rem' : '0.88rem', fontWeight: 700, lineHeight: 1.25 }}>{line}</span>
        {c.first && (
          <span
            style={{
              fontSize: tv ? '1.05rem' : '0.78rem',
              color: 'var(--text-secondary, #C9C2B3)',
              lineHeight: 1.3,
            }}
          >
            💡 {text.long}
          </span>
        )}
      </div>
    </div>
  );
}

function NoteCard({ n, tv }: { n: Note; tv: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref);
  return (
    <div
      ref={ref}
      role="status"
      style={{
        width: tv ? 'min(46rem, 90vw)' : 'min(26rem, 100%)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: tv ? '0.7rem 1.2rem' : '0.55rem 0.8rem',
        borderRadius: tv ? 18 : 14,
        background: 'rgba(224, 106, 94, 0.95)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
        color: '#fff',
        fontWeight: 700,
        fontSize: tv ? '1.2rem' : '0.86rem',
        lineHeight: 1.3,
      }}
    >
      <span style={{ fontSize: tv ? '1.6rem' : '1.25rem', flexShrink: 0 }}>{n.emoji}</span>
      <span>{n.text}</span>
    </div>
  );
}
