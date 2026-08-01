import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BitkaHostData, BitkaPlayerView } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { BitkaMapView } from './components/BitkaMapView';

const PANEL_IN = { opacity: 0, y: 26 };
const PANEL_AT = { opacity: 1, y: 0 };
const PANEL_OUT = { opacity: 0, y: -18 };

/** Naslov faze na TV-u — igrači gledaju mapu, ovo im kaže šta se traži. */
const PHASE_TITLE: Record<string, string> = {
  uvod: 'Bitka počinje',
  'redosled-pitanje': 'Ko bira prvi?',
  'redosled-odgovor': 'Ko bira prvi?',
  'redosled-rezultat': 'Redosled je određen',
  'baza-izbor': 'Podignite zamkove',
  'osvajanje-pitanje': 'Osvajanje',
  'osvajanje-odgovor': 'Osvajanje',
  'osvajanje-rezultat': 'Tačan odgovor',
  'osvajanje-izbor': 'Biranje teritorije',
  'napad-izbor': 'Izbor mete',
  'duel-pitanje': 'Duel',
  'duel-odgovor': 'Duel',
  'duel-broj': 'Nerešeno — broj odlučuje',
  'duel-rezultat': 'Ishod napada',
  rezultat: 'Kraj bitke',
  ended: 'Kraj bitke',
};

export default function BitkaHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevEventRef = useRef<string | null>(null);
  const prevSecRef = useRef<number>(0);

  const host = gameState?.data.host as BitkaHostData | undefined;
  const phase = gameState?.phase;

  // Zvuk se vezuje za PROMENU faze, ne za render: gameState je nov objekat na
  // svaki tick, pa bi inače zvonio jednom u sekundi.
  useEffect(() => {
    if (!phase) return;
    if (prevPhaseRef.current !== phase) {
      prevPhaseRef.current = phase;
      if (phase === 'osvajanje-rezultat' || phase === 'redosled-rezultat') play('reveal');
      if (phase === 'baza-izbor' || phase === 'napad-izbor') play('join');
      if (phase === 'rezultat') play('victory');
    }
  }, [phase, play]);

  // Ishod napada ima svoj zvuk, ali samo jednom po duelu.
  useEffect(() => {
    const outcome = host?.duel?.outcome;
    if (phase !== 'duel-rezultat' || !outcome) return;
    const key = `${host?.duel?.territoryId}:${outcome}`;
    if (prevEventRef.current === key) return;
    prevEventRef.current = key;
    if (outcome === 'zamak-pao') play('victory');
    else if (outcome === 'branilac') play('wrong');
    else play('correct');
  }, [phase, host, play]);

  // Odbrojavanje u poslednjih 5 sekundi aktivnih faza.
  useEffect(() => {
    if (!gameState) return;
    const answering =
      phase === 'redosled-odgovor' ||
      phase === 'osvajanje-odgovor' ||
      phase === 'duel-odgovor' ||
      phase === 'duel-broj' ||
      phase === 'baza-izbor' ||
      phase === 'napad-izbor' ||
      phase === 'osvajanje-izbor';
    const sec = Math.ceil(gameState.timeRemaining);
    if (answering && sec !== prevSecRef.current && sec <= 5 && sec > 0) play('tick');
    prevSecRef.current = sec;
  }, [gameState, phase, play]);

  if (!gameState || !host) return null;
  if (phase === 'rezultat' || phase === 'ended') {
    return <FinalBoard host={host} />;
  }

  const seconds = Math.ceil(gameState.timeRemaining);
  const showClock =
    phase === 'redosled-odgovor' ||
    phase === 'osvajanje-odgovor' ||
    phase === 'duel-odgovor' ||
    phase === 'duel-broj' ||
    phase === 'baza-izbor' ||
    phase === 'osvajanje-izbor' ||
    phase === 'napad-izbor';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem',
        padding: '1rem 1.4rem 1.2rem',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '1.9rem',
            color: 'var(--text-primary)',
          }}
        >
          {PHASE_TITLE[phase ?? ''] ?? 'Osvajanje'}
        </h1>
        <span style={{ color: 'var(--dim)', fontSize: '1rem' }}>
          {host.round > 0
            ? `Rat · runda ${host.round}/${host.totalRounds}`
            : host.osvajanjeRound
              ? `Osvajanje · ${host.osvajanjeRound}. pitanje`
              : host.map.name}
        </span>
        <span style={{ flex: 1 }} />
        {showClock && (
          <span
            style={{
              padding: '0.3rem 1.1rem',
              borderRadius: '999px',
              background: seconds <= 5 ? 'rgba(224,106,94,0.22)' : 'var(--bg-card)',
              border: `1px solid ${seconds <= 5 ? 'var(--danger)' : 'var(--line2)'}`,
              fontWeight: 800,
              fontSize: '1.3rem',
              color: seconds <= 5 ? 'var(--danger)' : 'var(--text-primary)',
              minWidth: '3.2rem',
              textAlign: 'center',
            }}
          >
            {seconds}
          </span>
        )}
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 300px',
          gap: '1.2rem',
          alignItems: 'center',
        }}
      >
        <BitkaMapView
          map={host.map}
          board={host.board}
          players={host.players}
          highlightIds={host.selectableIds}
          focusId={host.duel?.territoryId ?? null}
          maxHeightCss="54vh"
        />
        <Standings players={host.players} activeId={host.activePlayerId ?? null} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={panelKey(host, phase ?? '')}
          initial={PANEL_IN}
          animate={PANEL_AT}
          exit={PANEL_OUT}
          transition={{ duration: 0.22 }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '0.9rem 1.2rem',
            minHeight: '5.4rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Panel host={host} phase={phase ?? ''} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Ključ panela — menja se kad se promeni ono što panel prikazuje. */
function panelKey(host: BitkaHostData, phase: string): string {
  if (phase.startsWith('duel')) return `${phase}:${host.duel?.territoryId ?? ''}`;
  if (phase.startsWith('osvajanje')) return `${phase}:${host.osvajanjeRound ?? 0}:${host.activePlayerId ?? ''}`;
  if (phase === 'napad-izbor') return `${phase}:${host.activePlayerId ?? ''}`;
  return phase;
}

// --- Delovi -----------------------------------------------------------------

function Panel({ host, phase }: { host: BitkaHostData; phase: string }) {
  const named = (id: string | null | undefined) =>
    host.players.find((p) => p.playerId === id)?.name ?? 'Igrač';

  if (phase === 'uvod') {
    return (
      <Line
        title={host.map.name}
        text="Svako bira svoj zamak, pa se kroz pitanja osvaja zemlja. Ko sruši tri zida tuđeg zamka — uzima sve."
      />
    );
  }

  if (phase === 'baza-izbor') {
    const done = new Set(host.baseCommittedIds ?? []);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', width: '100%' }}>
        <Line title="Tapnite teritoriju na telefonu" text="Ako dvoje izaberu isto, prednost ima bolji rezultat sa uvodnog pitanja." />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {host.players.map((p) => (
            <Chip key={p.playerId} player={p} dim={!done.has(p.playerId)} label={done.has(p.playerId) ? 'spreman' : 'bira…'} />
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'osvajanje-izbor') {
    return (
      <Line
        title={`${named(host.activePlayerId)} bira slobodnu teritoriju`}
        text={
          (host.pickQueue?.length ?? 0) > 1
            ? `Na redu posle: ${(host.pickQueue ?? []).slice(1).map(named).join(', ')}`
            : 'Poslednji izbor u ovoj rundi.'
        }
      />
    );
  }

  if (phase === 'napad-izbor') {
    return (
      <Line
        title={`${named(host.activePlayerId)} bira metu`}
        text="Napada se susedna tuđa ili ničija teritorija."
      />
    );
  }

  if (phase === 'duel-rezultat' && host.duel) {
    const { duel } = host;
    const place = host.map.territories.find((t) => t.id === duel.territoryId)?.name ?? '';
    const text =
      duel.outcome === 'zamak-pao'
        ? `Zamak je pao — ${named(duel.attackerId)} uzima svu zemlju!`
        : duel.outcome === 'zid'
          ? 'Jedan zid manje.'
          : duel.outcome === 'napadac'
            ? `${place} menja gospodara.`
            : `${place} je odbranjen.`;
    return <Line title={host.lastEvent ?? 'Ishod'} text={text} />;
  }

  if (host.question) {
    return <QuestionPanel host={host} phase={phase} />;
  }

  return <Line title={host.lastEvent ?? '—'} text="" />;
}

function QuestionPanel({ host, phase }: { host: BitkaHostData; phase: string }) {
  const q = host.question!;
  const answered = new Set(host.answeredIds ?? []);
  const revealing = phase.endsWith('-rezultat');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', width: '100%' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{q.text}</div>
        {q.kind === 'izbor' && q.options && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {q.options.map((o) => {
              const right = revealing && host.correctIndex === o.index;
              return (
                <span
                  key={o.index}
                  style={{
                    padding: '0.3rem 0.8rem',
                    borderRadius: '10px',
                    background: right ? 'var(--success)' : o.color,
                    opacity: revealing && !right ? 0.35 : 1,
                    color: '#fff',
                    fontWeight: 700,
                    transition: 'opacity 0.25s',
                  }}
                >
                  {o.text}
                </span>
              );
            })}
          </div>
        )}
        {q.kind === 'broj' && (
          <div style={{ marginTop: '0.4rem', color: 'var(--text-secondary)' }}>
            Opseg {q.min}–{q.max}
            {q.unit ? ` ${q.unit}` : ''}
            {revealing && host.correctValue != null && (
              <strong style={{ color: 'var(--accent)' }}>
                {' '}
                · tačno: {host.correctValue}
                {q.unit ? ` ${q.unit}` : ''}
              </strong>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(host.expectedIds ?? []).map((id) => {
          const p = host.players.find((x) => x.playerId === id);
          if (!p) return null;
          const result = host.results?.find((r) => r.playerId === id);
          const label = revealing
            ? result?.correct
              ? 'tačno'
              : 'netačno'
            : answered.has(id)
              ? 'odgovorio'
              : '…';
          return <Chip key={id} player={p} dim={!revealing && !answered.has(id)} label={label} good={revealing ? result?.correct : undefined} />;
        })}
      </div>
    </div>
  );
}

function Line({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
      {text && <div style={{ color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{text}</div>}
    </div>
  );
}

function Chip({
  player,
  dim,
  label,
  good,
}: {
  player: BitkaPlayerView;
  dim?: boolean;
  label: string;
  good?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.35rem 0.7rem',
        borderRadius: '999px',
        background: 'var(--bg-secondary)',
        borderLeft: `4px solid ${player.avatarColor}`,
        opacity: dim ? 0.45 : 1,
        transition: 'opacity 0.25s',
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>{player.avatarEmoji}</span>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{player.name}</span>
      <span
        style={{
          fontSize: '0.8rem',
          color: good === true ? 'var(--success)' : good === false ? 'var(--danger)' : 'var(--dim)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Standings({ players, activeId }: { players: BitkaPlayerView[]; activeId: string | null }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {sorted.map((p) => (
        <motion.div
          key={p.playerId}
          layout
          style={{
            padding: '0.6rem 0.8rem',
            borderRadius: '12px',
            background: p.playerId === activeId ? 'rgba(194, 155, 71, 0.18)' : 'var(--bg-card)',
            border: `1px solid ${p.playerId === activeId ? 'var(--accent)' : 'var(--line)'}`,
            borderLeft: `5px solid ${p.avatarColor}`,
            opacity: p.eliminated ? 0.4 : 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>{p.avatarEmoji}</span>
            <span style={{ flex: 1, fontWeight: 800, color: 'var(--text-primary)' }}>{p.name}</span>
            <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{p.score}</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--dim)', marginTop: '0.15rem' }}>
            {p.eliminated ? 'ispao iz bitke' : `${p.territories} teritorija · zidova ${p.walls}`}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function FinalBoard({ host }: { host: BitkaHostData }) {
  const board = host.leaderboard ?? [];
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.4rem',
        padding: '2rem',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '2.6rem', color: 'var(--accent)' }}>
        Bitka je gotova
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: '2rem', alignItems: 'center', width: '100%', maxWidth: '1400px' }}>
        <BitkaMapView
          map={host.map}
          board={host.board}
          players={host.players}
          maxHeightCss="52vh"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {board.map((entry) => (
            <motion.div
              key={entry.playerId}
              layout
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
                padding: '0.8rem 1rem',
                borderRadius: '14px',
                background: entry.rank === 1 ? 'rgba(194, 155, 71, 0.18)' : 'var(--bg-card)',
                border: `1px solid ${entry.rank === 1 ? 'var(--accent)' : 'var(--line)'}`,
              }}
            >
              <span style={{ width: '2rem', fontWeight: 800, color: 'var(--dim)' }}>{entry.rank}.</span>
              <span
                style={{
                  width: '2.4rem',
                  height: '2.4rem',
                  borderRadius: '50%',
                  background: entry.avatarColor,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '1.3rem',
                }}
              >
                {entry.avatarEmoji}
              </span>
              <span style={{ flex: 1, fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                {entry.name}
              </span>
              <span style={{ color: 'var(--dim)' }}>{entry.territories} ter.</span>
              <span style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent)' }}>{entry.score}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
