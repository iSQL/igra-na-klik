import { socket } from '../socket';
import { useGameStore } from '../store/gameStore';
import {
  currentQuizQuestion,
  useQuizFeedbackStore,
  type SeenQuestion,
} from '../store/quizFeedbackStore';

/**
 * Prijava i ocena pitanja, u popupu igrača.
 *
 * Radi u **svakoj igri koja vuče kviz pakete** — Kviz, KvizAtar i Vrući
 * krompir postavljaju ista pitanja iz istih paketa, pa i prijava mora da
 * završi na istom mestu; server to knjiži jednim knjigovođom
 * (`QuizFeedbackTracker`).
 *
 * Uz tekuće pitanje stoji i **prethodno**. Bez toga se sporna pitanja skoro
 * nikad ne prijave: pitanje deluje pogrešno tek kad se vidi tačan odgovor, a
 * do trenutka kad igrač otvori popup ekran je već otišao dalje. Istorija se
 * puni u `quizFeedbackStore`, van ove komponente, jer popup najčešće nije ni
 * otvoren kad pitanje prođe.
 */
export function QuizFeedbackMenu() {
  const gameState = useGameStore((s) => s.gameState);
  const seen = useQuizFeedbackStore((s) => s.seen);
  const reported = useQuizFeedbackStore((s) => s.reported);
  const rated = useQuizFeedbackStore((s) => s.rated);
  const markReported = useQuizFeedbackStore((s) => s.markReported);
  const markRated = useQuizFeedbackStore((s) => s.markRated);

  const current = currentQuizQuestion(gameState);
  // Prethodno = poslednje viđeno koje nije tekuće. Kad pitanje trenutno nije
  // na ekranu (pauza, mapa, ishod duela), prethodno je prosto poslednje.
  const previous = current
    ? (seen.filter((q) => q.id !== current.id).slice(-1)[0] ?? null)
    : (seen.slice(-1)[0] ?? null);

  if (!current && !previous) return null;

  const send = (q: SeenQuestion, payload: { report?: boolean; rating?: number }) => {
    socket.emit('game:player-action', {
      action: 'quiz:feedback',
      data: { questionId: q.id, ...payload },
    });
  };

  const sendReport = (q: SeenQuestion) => {
    if (reported.includes(q.id)) return;
    markReported(q.id);
    send(q, { report: true });
  };

  const sendRating = (q: SeenQuestion, value: number) => {
    if (rated[q.id]) return;
    markRated(q.id, value);
    send(q, { rating: value });
  };

  return (
    <>
      <div style={{ height: '1px', background: 'var(--line2)', margin: '0.15rem 0' }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: '0.6rem 0.7rem',
          borderRadius: '12px',
          background: 'var(--bg-card)',
          border: '1px solid var(--line2)',
        }}
      >
        {current && (
          <>
            <Naslov>Oceni pitanje</Naslov>
            <Zvezde
              value={rated[current.id] ?? 0}
              onPick={(n) => sendRating(current, n)}
            />
            {rated[current.id] > 0 && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--success)', fontWeight: 700 }}>
                Ocena poslata: {rated[current.id]}/5
              </p>
            )}
            <PrijaviDugme
              done={reported.includes(current.id)}
              onClick={() => sendReport(current)}
              label="Prijavi pitanje kao netačno"
            />
          </>
        )}

        {/* Prethodno pitanje: sopstvena sekcija, sa tekstom — bez njega igrač
            ne zna koje pitanje prijavljuje, a upravo je to i poenta. */}
        {previous && (
          <>
            {current && (
              <div style={{ height: '1px', background: 'var(--line2)', margin: '0.1rem 0' }} />
            )}
            <Naslov>Prethodno pitanje</Naslov>
            {previous.label && (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                „{previous.label}"
              </p>
            )}
            <PrijaviDugme
              done={reported.includes(previous.id)}
              onClick={() => sendReport(previous)}
              label="Prijavi prethodno kao netačno"
            />
          </>
        )}
      </div>
    </>
  );
}

function Naslov({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: '0.72rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </span>
  );
}

function Zvezde({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.2rem' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          disabled={value > 0}
          onClick={() => onPick(n)}
          aria-label={`${n} od 5`}
          style={{
            flex: 1,
            fontSize: '1.5rem',
            lineHeight: 1,
            padding: '0.15rem 0',
            background: 'transparent',
            border: 'none',
            cursor: value > 0 ? 'default' : 'pointer',
            filter: value >= n ? 'none' : 'grayscale(1) opacity(0.4)',
            transition: 'filter .1s',
          }}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}

function PrijaviDugme({
  done,
  onClick,
  label,
}: {
  done: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      style={{
        width: '100%',
        padding: '0.55rem',
        fontSize: '0.85rem',
        fontWeight: 700,
        borderRadius: '10px',
        border: '1px solid var(--danger)',
        background: done ? 'transparent' : 'color-mix(in srgb, var(--danger) 12%, transparent)',
        color: 'var(--danger)',
        cursor: done ? 'default' : 'pointer',
      }}
    >
      {done ? '✓ Prijavljeno' : `⚠ ${label}`}
    </button>
  );
}
