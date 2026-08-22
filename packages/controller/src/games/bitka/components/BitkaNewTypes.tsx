import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatBrojValue } from '@igra/shared';
import type {
  BitkaAnswerResult,
  BitkaControllerData,
  BitkaHostData,
  BitkaPlayerView,
  BitkaQuestionView,
} from '@igra/shared';
import { useHaptics } from '../../../hooks/useHaptics';
import { BitkaPackChip } from './BitkaPackChip';
import { BitkaMatricaScoreRow } from './BitkaMatricaCells';
import { SubmittedBar } from './BitkaSubmittedBar';

/**
 * Telefonski ekrani za redosled, domino i slobodan tekst.
 *
 * Svaki tip ima jednu komponentu koja pokriva i odgovaranje i otkrivanje, i
 * jednu „samo gledanje" varijantu koju koriste posmatrač duela i hostless
 * traka — isti crtež, bez dugmadi. Isto što je matrica već radila.
 */

function Avatar({ player, size }: { player: BitkaPlayerView; size: string }) {
  return (
    <span
      title={player.name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: player.avatarColor,
        border: '2px solid rgba(0,0,0,0.35)',
        display: 'grid',
        placeItems: 'center',
        fontSize: `calc(${size} * 0.55)`,
        flexShrink: 0,
      }}
    >
      {player.avatarEmoji}
    </span>
  );
}

/**
 * Sat u zaglavlju SVAKOG ekrana odgovaranja — jedan element, nezavisan od
 * dugmeta za slanje. Dotad je brojač živeo u tekstu dugmeta („Pošalji · 7s"),
 * pa je nestajao čim je dugme onemogućeno ili poslato. Ispod 5 s pocrveni i
 * otkucava, isto što je DuelBanner već radio.
 */
export function Clock({ seconds, size = '1.4rem' }: { seconds: number; size?: string }) {
  return (
    <span
      className={seconds <= 5 ? 'bitka-tick' : undefined}
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        flexShrink: 0,
        color: seconds <= 5 ? 'var(--danger)' : 'var(--text-secondary)',
      }}
    >
      {seconds}s
    </span>
  );
}

// ---------------------------------------------------------------------------
// Redosled
// ---------------------------------------------------------------------------

/**
 * Lista pojmova — u otkrivanju prepisana u tačan poredak, sa avatarima onih
 * koji su stavku pogodili baš na to mesto.
 */
export function BitkaRedosledView({
  question,
  host,
  results,
  revealing,
  picked,
  onToggle,
  myPlayerId,
  compact,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  results?: BitkaAnswerResult[];
  revealing?: boolean;
  /** picked[k] = indeks prikazane stavke na k-tom mestu igračevog poretka. */
  picked?: number[];
  onToggle?: (shownIdx: number) => void;
  myPlayerId?: string;
  compact?: boolean;
}) {
  const items = question.items ?? [];
  const rows =
    revealing && host.correctOrder
      ? host.correctOrder.map((shownIdx, pos) => ({ shownIdx, pos }))
      : items.map((_, shownIdx) => ({ shownIdx, pos: -1 }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.2rem' : '0.35rem' }}>
      {rows.map(({ shownIdx, pos }) => {
        const at = picked?.indexOf(shownIdx) ?? -1;
        const takers =
          revealing && pos >= 0
            ? (results ?? [])
                .filter((r) => (r.order ?? [])[pos] === shownIdx)
                .map((r) => host.players.find((p) => p.playerId === r.playerId))
                .filter((p): p is BitkaPlayerView => !!p)
            : [];
        return (
          <button
            key={shownIdx}
            type="button"
            disabled={!onToggle}
            onClick={onToggle ? () => onToggle(shownIdx) : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: compact ? '0.25rem 0.45rem' : '0.55rem 0.7rem',
              borderRadius: '12px',
              background: 'var(--bg-secondary)',
              border:
                revealing && pos >= 0
                  ? '2px solid var(--success)'
                  : at >= 0
                    ? '2px solid var(--accent)'
                    : '2px solid var(--line2)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: compact ? '0.72rem' : '0.9rem',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                minWidth: '1.6rem',
                // Redni broj je ono što igrač proverava pre potvrde — mora
                // da se pročita i sa pola metra.
                fontSize: compact ? '0.9rem' : '1.3rem',
                lineHeight: 1,
                fontWeight: 900,
                color: revealing && pos >= 0 ? 'var(--success)' : at >= 0 ? 'var(--accent)' : 'var(--dim)',
              }}
            >
              {revealing && pos >= 0 ? `${pos + 1}.` : at >= 0 ? `${at + 1}.` : '·'}
            </span>
            <span style={{ flex: 1 }}>{items[shownIdx]}</span>
            {takers.map((p) => (
              <Avatar
                key={p.playerId}
                player={p}
                size={compact ? '1rem' : '1.3rem'}
              />
            ))}
          </button>
        );
      })}
      {revealing && results && (
        <BitkaMatricaScoreRow
          results={results}
          players={host.players}
          pick={items.length}
          myPlayerId={myPlayerId}
        />
      )}
    </div>
  );
}

/** Ekran odgovaranja: tapni pojmove redom, pa „Potvrdi" — jedan odgovor. */
export function BitkaRedosledScreen({
  question,
  host,
  header,
  footer,
  playerId,
  me,
  revealing,
  hostless,
  onSubmit,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  header: ReactNode;
  footer?: ReactNode;
  playerId: string;
  me: BitkaControllerData | undefined;
  revealing: boolean;
  hostless: boolean;
  onSubmit: (order: number[]) => void;
}) {
  const haptics = useHaptics();
  const items = question.items ?? [];
  const [picked, setPicked] = useState<number[]>([]);
  const answered = !!me?.hasAnswered;
  const shown = answered && me?.selectedOrder ? me.selectedOrder : picked;
  const locked = answered || revealing;

  const toggle = (idx: number) => {
    if (locked) return;
    haptics.tap();
    setPicked((prev) => (prev.includes(idx) ? prev.filter((v) => v !== idx) : [...prev, idx]));
  };

  return (
    <Screen header={header} footer={footer} title={question.text} pack={question.packName}>
      <BitkaRedosledView
        question={question}
        host={host}
        results={revealing ? (host.results ?? []) : undefined}
        revealing={revealing}
        picked={shown}
        onToggle={locked ? undefined : toggle}
        myPlayerId={playerId}
      />
      {!revealing && answered && (
        <SubmittedBar host={host} myPlayerId={playerId} hostless={hostless} />
      )}
      {!revealing && !answered && (
        <>
          {/* Ispravka bez ponovnog tapkanja po listi: skini poslednji ili
              kreni ispočetka. Tap na već poređanu stavku je i dalje moguć,
              ali on vadi stavku iz sredine — što retko ko hoće. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-ghost"
              disabled={shown.length === 0}
              onClick={() => {
                haptics.tap();
                setPicked((prev) => prev.slice(0, -1));
              }}
              style={{ minHeight: '42px', fontSize: '0.9rem', fontWeight: 800 }}
            >
              ⌫ poslednji
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={shown.length === 0}
              onClick={() => {
                haptics.tap();
                setPicked([]);
              }}
              style={{ minHeight: '42px', fontSize: '0.9rem', fontWeight: 800 }}
            >
              ispočetka
            </button>
          </div>
          <button
            className="btn-primary"
            disabled={shown.length !== items.length}
            onClick={() => {
              haptics.tap();
              onSubmit([...shown]);
            }}
            style={{ minHeight: '50px', fontSize: '1rem', fontWeight: 800 }}
          >
            {shown.length === items.length ? 'Potvrdi' : `Poređano ${shown.length}/${items.length}`}
          </button>
        </>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Domino
// ---------------------------------------------------------------------------

/** Trka po igraču — dokle je ko stigao; u otkrivanju ceo niz sa vrednostima. */
export function BitkaDominoView({
  question,
  host,
  results,
  revealing,
  myPlayerId,
  compact,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  results?: BitkaAnswerResult[];
  revealing?: boolean;
  myPlayerId?: string;
  compact?: boolean;
}) {
  const steps = question.steps ?? 1;

  if (revealing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'center' }}>
          {(host.dominoChain ?? []).map((it, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '0.2rem 0.4rem',
                borderRadius: '10px',
                background: 'var(--bg-secondary)',
                border: '2px solid var(--line2)',
                fontSize: compact ? '0.65rem' : '0.75rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              <span>{it.label}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 900 }}>
                {formatBrojValue(it.value, question.unit, question.valueType)}
              </span>
            </span>
          ))}
        </div>
        {results && (
          <BitkaMatricaScoreRow
            results={results}
            players={host.players}
            pick={steps}
            myPlayerId={myPlayerId}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {(host.dominoProgress ?? []).map((pr) => {
        const p = host.players.find((x) => x.playerId === pr.playerId);
        if (!p) return null;
        const pct = Math.round((Math.min(pr.streak, steps) / steps) * 100);
        return (
          <div key={pr.playerId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Avatar player={p} size={compact ? '1.1rem' : '1.4rem'} />
            <div
              style={{
                flex: 1,
                height: '0.5rem',
                borderRadius: '999px',
                background: 'var(--bg-secondary)',
                border: '1.5px solid var(--line2)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: pr.done ? 'var(--dim)' : 'var(--accent)',
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                color: pr.done ? 'var(--dim)' : 'var(--accent)',
                minWidth: '2.2rem',
                textAlign: 'right',
              }}
            >
              {pr.streak}/{steps}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Ekran odgovaranja: referenca sa vrednošću, sledeći pojam bez nje, dva
 * dugmeta. Igrač hoda niz sam i staje na prvoj grešci — jedini unos u igri
 * koji nije jedan potez, pa se rezultat upisuje tek kad stane (ili istekne
 * vreme, kad server upiše dokle je stigao).
 */
export function BitkaDominoScreen({
  question,
  host,
  header,
  footer,
  playerId,
  me,
  revealing,
  hostless,
  onStep,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  header: ReactNode;
  footer?: ReactNode;
  playerId: string;
  me: BitkaControllerData | undefined;
  revealing: boolean;
  hostless: boolean;
  onStep: (dir: 'before' | 'after') => void;
}) {
  const haptics = useHaptics();
  const d = me?.domino;
  const steps = question.steps ?? 1;

  if (revealing) {
    return (
      <Screen header={header} footer={footer} title={question.text} pack={question.packName}>
        <BitkaDominoView
          question={question}
          host={host}
          results={host.results ?? []}
          revealing
          myPlayerId={playerId}
        />
      </Screen>
    );
  }

  if (!d || d.done || !d.current) {
    return (
      <Screen header={header} footer={footer} title={question.text} pack={question.packName}>
        <p style={{ fontSize: '2.2rem', margin: 0, textAlign: 'center' }}>
          {d && d.streak >= steps ? '🏆' : '🔒'}
        </p>
        <SubmittedBar
          host={host}
          myPlayerId={playerId}
          hostless={hostless}
          note={`${d?.streak ?? 0}/${steps} tačno`}
        />
        <BitkaDominoView question={question} host={host} myPlayerId={playerId} />
      </Screen>
    );
  }

  return (
    <Screen header={header} footer={footer} title={question.text} pack={question.packName}>
      {d.reference && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            borderRadius: '14px',
            padding: '0.6rem 0.8rem',
            textAlign: 'center',
            border: '2px solid var(--line2)',
          }}
        >
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>Referenca</p>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.1rem 0 0' }}>
            {d.reference.label}
          </p>
          <p style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent)', margin: 0 }}>
            {formatBrojValue(d.reference.value, question.unit, question.valueType)}
          </p>
        </div>
      )}
      <p
        style={{
          margin: 0,
          textAlign: 'center',
          fontSize: '1.15rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
        }}
      >
        {d.current}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {(['before', 'after'] as const).map((dir) => (
          <button
            key={dir}
            className="btn-primary"
            onClick={() => {
              haptics.tap();
              onStep(dir);
            }}
            style={{ minHeight: '58px', fontSize: '1rem', fontWeight: 800 }}
          >
            {dir === 'before' ? (question.lowerLabel ?? 'Pre') : (question.higherLabel ?? 'Posle')}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        Niz: {d.streak}/{steps}
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Slobodan tekst — emoji / citat / anagram
// ---------------------------------------------------------------------------

/** Zagonetka + (u otkrivanju) tačan odgovor i šta je ko otkucao. */
export function BitkaTextView({
  question,
  host,
  results,
  revealing,
  compact,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  results?: BitkaAnswerResult[];
  revealing?: boolean;
  compact?: boolean;
}) {
  const riddle =
    question.textKind === 'emoji'
      ? question.emojis
      : question.textKind === 'anagram'
        ? question.scramble
        : question.quote;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {riddle && (
        <div
          style={{
            textAlign: 'center',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.25,
            letterSpacing: question.textKind === 'anagram' ? '0.25em' : undefined,
            fontSize:
              question.textKind === 'emoji'
                ? compact
                  ? '1.5rem'
                  : '2.6rem'
                : compact
                  ? '0.8rem'
                  : '1.1rem',
          }}
        >
          {riddle}
          {question.textKind === 'dopuna' && ' …'}
        </div>
      )}
      {question.category && !revealing && (
        <div
          style={{
            textAlign: 'center',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
          }}
        >
          {question.category}
        </div>
      )}
      {revealing && host.correctText && (
        <div
          style={{
            textAlign: 'center',
            fontSize: compact ? '0.85rem' : '1.2rem',
            fontWeight: 900,
            color: 'var(--accent)',
          }}
        >
          {host.correctText}
        </div>
      )}
      {revealing && results && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'center' }}>
          {results.map((r) => {
            const p = host.players.find((x) => x.playerId === r.playerId);
            if (!p) return null;
            return (
              <span
                key={r.playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '999px',
                  background: 'var(--bg-secondary)',
                  border: `2px solid ${r.correct ? 'var(--success)' : 'var(--line2)'}`,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                <Avatar player={p} size="1.1rem" />
                <span style={{ color: r.correct ? 'var(--success)' : 'var(--dim)' }}>
                  {r.correct ? (r.text ?? '✓') : 'nije pogodio'}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Ekran odgovaranja za slobodan tekst.
 *
 * Promašaj NE troši odgovor — jedini unos u igri koji se sme ponavljati, jer
 * bi inače tipfeler koštao zamka. Cena je da faza ide do kraja kad neko ne
 * pogodi, pošto rani izlazak traži da su svi gotovi.
 */
export function BitkaTextScreen({
  question,
  host,
  header,
  footer,
  playerId,
  me,
  revealing,
  hostless,
  onSubmit,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  header: ReactNode;
  footer?: ReactNode;
  playerId: string;
  me: BitkaControllerData | undefined;
  revealing: boolean;
  hostless: boolean;
  onSubmit: (text: string) => void;
}) {
  const haptics = useHaptics();
  const [draft, setDraft] = useState('');
  const [tries, setTries] = useState(0);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const solved = !!me?.hasAnswered;
  const wrong = me?.lastWrongText ?? null;

  // Promašaj: zatrese polje, zazuji i OZNAČI tekst umesto da ga obriše —
  // tipfeler se ispravlja sa dva slova, a ne kucanjem ispočetka. Prvi render
  // (reconnect sa starim promašajem) ne trese.
  const firstWrongRef = useRef(true);
  useEffect(() => {
    if (wrong == null) return;
    if (firstWrongRef.current) {
      firstWrongRef.current = false;
      return;
    }
    haptics.error();
    setShake((n) => n + 1);
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [wrong, haptics]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    haptics.tap();
    setTries((n) => n + 1);
    onSubmit(text);
  };

  return (
    <Screen
      header={header}
      footer={footer}
      title={question.text}
      pack={question.packName}
      // Od vrha naniže: zagonetka → polje → dugme. Centriranje bi tastatura
      // gurnula tako da dugme ode ispod nje.
      align="start"
    >
      <BitkaTextView
        question={question}
        host={host}
        results={revealing ? (host.results ?? []) : undefined}
        revealing={revealing}
      />
      {!revealing && solved && (
        <SubmittedBar
          host={host}
          myPlayerId={playerId}
          hostless={hostless}
          note={me?.myText ? `Pogodio si: ${me.myText}` : undefined}
        />
      )}
      {!revealing && !solved && (
        <>
          {wrong && (
            <p style={{ margin: 0, textAlign: 'center', fontSize: '0.8rem', color: 'var(--danger)' }}>
              „{wrong}" nije to — probaj opet.{tries > 0 ? ` (${tries}. pokušaj)` : ''}
            </p>
          )}
          <input
            ref={inputRef}
            // Ključ tera nov element na svaki promašaj, pa se animacija
            // trešenja odigra ponovo; fokus se vraća u efektu iznad.
            key={shake}
            className={shake > 0 ? 'bitka-shake' : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="Tvoj odgovor…"
            // Fokus odmah, i po ulasku u fazu i po povratku (reconnect) — da
            // se ne troši sekunda na tap u polje.
            autoFocus
            enterKeyHint="send"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{
              width: '100%',
              padding: '0.8rem',
              fontSize: '1rem',
              fontWeight: 700,
              borderRadius: '12px',
              border: `2px solid ${wrong ? 'var(--danger)' : 'var(--line2)'}`,
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              textAlign: 'center',
            }}
          />
          <button
            className="btn-primary"
            disabled={!draft.trim()}
            onClick={submit}
            style={{ minHeight: '50px', fontSize: '1rem', fontWeight: 800 }}
          >
            Pošalji
          </button>
        </>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------

/** Zajednički okvir: zaglavlje, tekst pitanja, sadržaj, podnožje. */
function Screen({
  header,
  footer,
  title,
  pack,
  align = 'center',
  children,
}: {
  header: ReactNode;
  footer?: ReactNode;
  title: string;
  /** Ime paka — kategorija iznad pitanja; nema ga za ugrađenu banku. */
  pack?: string;
  /** `start` — sadržaj od vrha (tekstualni unos, zbog tastature). */
  align?: 'center' | 'start';
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.9rem',
        gap: '0.6rem',
      }}
    >
      {header}
      <BitkaPackChip name={pack} />
      <p
        style={{
          margin: 0,
          fontSize: '1rem',
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {title}
      </p>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          // `safe center`: kad sadržaj ne staje, obično centriranje mu odseče
          // vrh (ono što ode iznad ivice ne može da se doskroluje). Unutrašnji
          // omotač sa `margin: auto` radi isto i tamo gde `safe` nije podržan.
          justifyContent: align === 'start' ? 'flex-start' : 'safe center',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
            margin: align === 'start' ? '0' : 'auto 0',
          }}
        >
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}
