import { useEffect, useRef, useState } from 'react';
import type {
  SlozilicaControllerData,
  SlozilicaHostData,
  SlozilicaRejection,
} from '@igra/shared';
import { SLOZILICA_MIN_WORD } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { useHaptics } from '../../hooks/useHaptics';
import { socket } from '../../socket';

const REJECTION_TEXT: Record<SlozilicaRejection, string> = {
  prekratko: `Prekratko — bar ${SLOZILICA_MIN_WORD} slova`,
  'nema-slova': 'Nemaš ta slova',
  'nije-rec': 'Nema te reči u rečniku',
  'vec-poslato': 'Tu reč si već poslao',
};

const center: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '0.9rem',
  padding: '1rem',
  textAlign: 'center',
};

export default function SlozilicaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as SlozilicaHostData;
  const my = playerData[playerId] as unknown as SlozilicaControllerData | undefined;

  if (phase === 'pisanje') {
    return <Writer letters={host.letters} my={my} seconds={timeRemaining} />;
  }

  if (phase === 'najava') {
    return (
      <div style={center}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {host.letters.map((l, i) => (
            <Tile key={i} letter={l} />
          ))}
        </div>
        <p style={{ fontSize: '1.5rem', fontWeight: 800 }}>Spremi se… {timeRemaining}</p>
      </div>
    );
  }

  // rezultati / ended
  const best = host.results?.find((r) => r.playerId === playerId);
  return (
    <div style={center}>
      <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
        {phase === 'ended' ? 'Kraj igre' : `Runda ${host.round}`}
      </p>
      {best?.bestWord ? (
        <>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.2rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {best.bestWord}
          </p>
          <p style={{ fontSize: '1.5rem', color: 'var(--accent)', fontWeight: 800 }}>
            +{best.points}
          </p>
        </>
      ) : (
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Ove runde bez reči 😬
        </p>
      )}
      {host.bestPossible?.[0] && (
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Najduže moguće: <strong>{host.bestPossible[0]}</strong>
        </p>
      )}
      <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
        ukupno {my?.score ?? 0} poena
      </p>
    </div>
  );
}

function Writer({
  letters,
  my,
  seconds,
}: {
  letters: string[];
  my?: SlozilicaControllerData;
  seconds: number;
}) {
  const haptics = useHaptics();
  // Indeksi pločica koje su ušle u reč — indeksi, ne slova, jer isto slovo
  // može biti podeljeno dva puta i svaka pločica se troši posebno.
  const [used, setUsed] = useState<number[]>([]);
  const wordCount = my?.myWords?.length ?? 0;
  const prevCount = useRef(wordCount);
  const prevRejected = useRef<string | null>(null);

  useEffect(() => {
    if (wordCount > prevCount.current) haptics.success();
    prevCount.current = wordCount;
  }, [wordCount, haptics]);

  const rejectedKey = my?.lastRejected
    ? `${my.lastRejected.word}:${my.lastRejected.reason}`
    : null;
  useEffect(() => {
    if (rejectedKey && rejectedKey !== prevRejected.current) haptics.error();
    prevRejected.current = rejectedKey;
  }, [rejectedKey, haptics]);

  const word = used.map((i) => letters[i]).join('');
  const canSend = [...word].length >= SLOZILICA_MIN_WORD;

  const toggleDone = () => {
    haptics.tap();
    socket.emit('game:player-action', { action: 'slozilica:done', data: {} });
  };

  // Rekao je „gotov sam" — runda čeka još samo ostale (ili tajmer).
  if (my?.done) {
    return (
      <div style={{ ...center, gap: '0.7rem' }}>
        <p style={{ fontSize: '2rem' }}>✅</p>
        <p style={{ fontSize: '1.3rem', fontWeight: 800 }}>Čekamo ostale…</p>
        {my.myBest ? (
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            tvoja najbolja: <strong style={{ color: 'var(--text-primary)' }}>{my.myBest}</strong>{' '}
            · <strong style={{ color: 'var(--accent)' }}>{my.myPoints}</strong>
          </p>
        ) : (
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            bez reči ove runde
          </p>
        )}
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{seconds}s</p>
        <button
          onClick={toggleDone}
          style={{
            padding: '0.7rem 1.4rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--line2)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '1rem',
            fontWeight: 700,
          }}
        >
          Nastavi da tražim
        </button>
      </div>
    );
  }

  const send = () => {
    if (!canSend) return;
    socket.emit('game:player-action', {
      action: 'slozilica:submit',
      data: { word },
    });
    setUsed([]);
  };

  return (
    // Ceo ekran mora da stane bez skrolovanja: root je fiksne visine sa
    // overflow:hidden, a jedina rastegljiva zona je lista pronađenih reči
    // (flex:1 + minHeight:0 — bez toga bi lista gurala dugmad van ekrana).
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '0.6rem',
        gap: '0.45rem',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {wordCount} {wordCount === 1 ? 'reč' : 'reči'} · najbolja{' '}
          <strong style={{ color: 'var(--accent)' }}>{my?.myPoints ?? 0}</strong>
        </span>
        <span
          style={{
            fontSize: '1.1rem',
            fontWeight: 800,
            color: seconds <= 10 ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {seconds}s
        </span>
      </div>

      {/* Trenutna reč */}
      <div
        style={{
          minHeight: '2.5rem',
          display: 'grid',
          placeItems: 'center',
          borderRadius: '0.5rem',
          background: 'var(--bg-card)',
          border: '1px solid var(--line)',
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {word || <span style={{ fontSize: '0.85rem', letterSpacing: 0, color: 'var(--dim)' }}>tapni slova</span>}
      </div>

      <p
        style={{
          fontSize: '0.78rem',
          color: my?.lastRejected ? 'var(--danger)' : 'transparent',
          textAlign: 'center',
          margin: 0,
          minHeight: '1rem',
          flexShrink: 0,
        }}
      >
        {my?.lastRejected
          ? `„${my.lastRejected.word}" — ${REJECTION_TEXT[my.lastRejected.reason]}`
          : ' '}
      </p>

      {/* Pločice — jedan red, kao na TV-u */}
      <div
        style={{
          display: 'grid',
          // Do 7 pločica staje u jedan red; preko toga se lomi u dva reda
          // (9 → 5+4, 11 → 6+5) jer bi 11 u redu bilo ~26px po pločici.
          gridTemplateColumns: `repeat(${
            letters.length <= 7 ? letters.length : Math.ceil(letters.length / 2)
          }, 1fr)`,
          gap: '0.3rem',
          flexShrink: 0,
        }}
      >
        {letters.map((letter, i) => {
          const spent = used.includes(i);
          return (
            <button
              key={i}
              onClick={() => {
                if (spent) return;
                haptics.tap();
                setUsed((u) => [...u, i]);
              }}
              disabled={spent}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: '0.45rem',
                border: 'none',
                padding: 0,
                background: spent
                  ? 'var(--bg-card)'
                  : 'linear-gradient(160deg, #f7efe2, #e4d7c0)',
                color: spent ? 'var(--dim)' : '#1d3557',
                fontFamily: 'var(--font-display)',
                // Skalira se sa širinom telefona umesto fiksne veličine.
                fontSize: 'clamp(0.95rem, 5.5vw, 1.7rem)',
                fontWeight: 800,
                textTransform: 'uppercase',
                opacity: spent ? 0.35 : 1,
                cursor: spent ? 'default' : 'pointer',
              }}
            >
              {letter}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0 }}>
        <button
          onClick={() => setUsed((u) => u.slice(0, -1))}
          disabled={used.length === 0}
          style={{
            flex: 1,
            padding: '0.7rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--line2)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '1rem',
            fontWeight: 700,
            opacity: used.length === 0 ? 0.4 : 1,
          }}
        >
          ⌫
        </button>
        <button
          onClick={send}
          disabled={!canSend}
          style={{
            flex: 2,
            padding: '0.7rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: canSend ? 'var(--accent)' : 'var(--bg-card)',
            color: canSend ? '#162e4e' : 'var(--dim)',
            fontSize: '1rem',
            fontWeight: 800,
          }}
        >
          Pošalji
        </button>
        <button
          onClick={toggleDone}
          style={{
            flex: 1.3,
            padding: '0.7rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--success)',
            background: 'transparent',
            color: 'var(--success)',
            fontSize: '0.9rem',
            fontWeight: 800,
          }}
        >
          Gotov ✓
        </button>
      </div>

      {/* Pronađene reči — jedina zona koja sme da skroluje.
          Desni razmak čuva mesto za lebdeće dugme menija igrača. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          gap: '0.3rem',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          paddingRight: '2.8rem',
        }}
      >
        {my?.myWords?.map((w) => (
          <span
            key={w.word}
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: '999px',
              fontSize: '0.8rem',
              height: 'fit-content',
              background: w.word === my.myBest ? 'rgba(194,155,71,0.22)' : 'var(--bg-card)',
              border: `1px solid ${w.word === my.myBest ? 'var(--accent)' : 'var(--line)'}`,
            }}
          >
            {w.word} <strong style={{ color: 'var(--accent)' }}>{w.points}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function Tile({ letter }: { letter: string }) {
  return (
    <span
      style={{
        width: '2.1rem',
        height: '2.5rem',
        display: 'grid',
        placeItems: 'center',
        borderRadius: '0.4rem',
        background: 'linear-gradient(160deg, #f7efe2, #e4d7c0)',
        color: '#1d3557',
        fontFamily: 'var(--font-display)',
        fontSize: '1.3rem',
        fontWeight: 800,
        textTransform: 'uppercase',
      }}
    >
      {letter}
    </span>
  );
}
