import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { GameFrame } from '../../components/kit/GameFrame';
import { RoundVerdict, verdictWash } from '../../components/kit/RoundVerdict';

const REJECTION_TEXT: Record<SlozilicaRejection, string> = {
  prekratko: `Prekratko — bar ${SLOZILICA_MIN_WORD} slova`,
  'nema-slova': 'Nemaš ta slova',
  'nije-rec': 'Nema te reči u rečniku',
  'vec-poslato': 'Tu reč si već poslao',
};

/** Mirrors PISANJE_DURATION on the server — only drives the drain bar. */
const PISANJE_SECONDS = 120;

const center: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '0.9rem',
  padding: '1rem 0',
  textAlign: 'center',
};

const slova = (n: number) => (n === 1 ? 'slovo' : 'slova');

export default function SlozilicaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as SlozilicaHostData;
  const my = playerData[playerId] as unknown as SlozilicaControllerData | undefined;
  const subtitle =
    phase === 'ended' ? 'Kraj igre' : `Runda ${host.round}/${host.totalRounds}`;

  let body: ReactNode;
  if (phase === 'pisanje') {
    body = <Writer letters={host.letters} my={my} />;
  } else if (phase === 'najava') {
    body = (
      <div style={center}>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {host.letters.map((l, i) => (
            <Slot key={i} letter={l} />
          ))}
        </div>
        <p className="display" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
          Spremi se… {timeRemaining}
        </p>
      </div>
    );
  } else {
    // rezultati / ended
    const best = host.results?.find((r) => r.playerId === playerId);
    body = (
      <div
        style={{
          ...center,
          justifyContent: 'flex-start',
          paddingTop: '1.5rem',
          background: verdictWash(best?.bestWord ? 'correct' : 'neutral'),
        }}
      >
        <RoundVerdict
          kind={best?.bestWord ? 'correct' : 'neutral'}
          icon={best?.bestWord ? '🔤' : '😬'}
          title={best?.bestWord ? best.bestWord.toUpperCase() : 'Ove runde bez reči'}
          points={best?.points ?? 0}
          total={my?.score ?? 0}
        />
        {host.bestPossible?.[0] && (
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Najduže moguće:{' '}
            <strong style={{ color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
              {host.bestPossible[0].toUpperCase()}
            </strong>
          </p>
        )}
      </div>
    );
  }

  return (
    <GameFrame
      gameId="slozilica"
      subtitle={subtitle}
      timeRemaining={phase === 'pisanje' ? timeRemaining : undefined}
      timeTotal={phase === 'pisanje' ? PISANJE_SECONDS : undefined}
      roundKey={phase === 'pisanje' ? host.round : undefined}
      roundCard={{ round: host.round, total: host.totalRounds }}
    >
      {body}
    </GameFrame>
  );
}

/** Columns per tile count: 9 → 3×3, 7 → 4+3, 11 → 4+4+3. */
function columnsFor(n: number): number {
  return n === 9 ? 3 : n <= 4 ? n : 4;
}

function Writer({ letters, my }: { letters: string[]; my?: SlozilicaControllerData }) {
  const haptics = useHaptics();
  // Indeksi pločica koje su ušle u reč — indeksi, ne slova, jer isto slovo
  // može biti podeljeno dva puta i svaka pločica se troši posebno.
  const [used, setUsed] = useState<number[]>([]);
  const wordCount = my?.myWords?.length ?? 0;
  const prevCount = useRef(wordCount);
  const prevRejected = useRef<string | null>(null);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (wordCount > prevCount.current) haptics.success();
    prevCount.current = wordCount;
  }, [wordCount, haptics]);

  const rejectedKey = my?.lastRejected
    ? `${my.lastRejected.word}:${my.lastRejected.reason}`
    : null;
  useEffect(() => {
    if (rejectedKey && rejectedKey !== prevRejected.current) {
      haptics.error();
      setShake((n) => n + 1);
    }
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
      <div style={center}>
        <span style={{ fontSize: '2.4rem' }}>✅</span>
        <p className="display" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
          Čekamo ostale…
        </p>
        {my.myBest ? (
          <BestBar word={my.myBest} />
        ) : (
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            bez reči ove runde
          </p>
        )}
        <button className="btn-ghost" onClick={toggleDone} style={{ marginTop: 8 }}>
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

  const cols = columnsFor(letters.length);
  const reason = my?.lastRejected
    ? `„${my.lastRejected.word}" — ${REJECTION_TEXT[my.lastRejected.reason]}`
    : null;

  return (
    // Ceo ekran mora da stane bez skrolovanja; jedina zona koja sme da se
    // skupi je prazan prostor između reči i pločica.
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        paddingTop: 14,
        overflow: 'hidden',
      }}
    >
      {my?.myBest ? (
        <BestBar word={my.myBest} />
      ) : (
        <div
          style={{
            height: 50,
            borderRadius: 16,
            border: '1px dashed var(--line2)',
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          Najduža reč se računa — šalji koliko hoćeš
        </div>
      )}

      {/* Reč u nastajanju: složena slova + prazna polja. Tap vraća slovo. */}
      <div
        key={shake}
        style={{
          marginTop: 28,
          display: 'flex',
          justifyContent: 'center',
          gap: 5,
          flexShrink: 0,
          animation: shake ? 'igra-nope .3s' : undefined,
        }}
      >
        {letters.map((_, slot) => {
          const tile = used[slot];
          return tile !== undefined ? (
            <Slot
              key={slot}
              letter={letters[tile]}
              count={letters.length}
              onClick={() => {
                haptics.tap();
                setUsed((u) => u.filter((_, i) => i !== slot));
              }}
            />
          ) : (
            <Slot key={slot} count={letters.length} faint={slot > used.length} />
          );
        })}
      </div>
      <span
        style={{
          marginTop: 10,
          minHeight: '1.2rem',
          textAlign: 'center',
          fontSize: '0.82rem',
          fontWeight: 700,
          color: reason ? 'var(--danger)' : 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        {reason ??
          (used.length
            ? `${used.length} ${slova(used.length)} · tapni slovo da ga vratiš`
            : 'Tapkaj pločice redom')}
      </span>

      <div style={{ flex: 1, minHeight: 8 }} />

      {/* Pločice ostaju na mestu — potrošena je samo obris, da se slova
          ne pomeraju pod palcem. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 10,
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
              aria-label={spent ? undefined : letter}
              style={{
                flex: `0 0 calc((100% - ${(cols - 1) * 10}px) / ${cols})`,
                height: cols === 3 ? 76 : 68,
                minHeight: 0,
                padding: 0,
                borderRadius: 18,
                border: spent ? '2px dashed var(--line2)' : 'none',
                background: spent ? 'transparent' : 'var(--text-primary)',
                color: 'var(--bg-primary)',
                boxShadow: spent ? 'none' : 'inset 0 -4px 0 rgba(0,0,0,.14)',
                fontFamily: 'var(--font-display)',
                fontSize: cols === 3 ? '2.1rem' : '1.9rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                cursor: spent ? 'default' : 'pointer',
              }}
            >
              {spent ? '' : letter}
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: '1fr 2fr',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <button
          className="btn-ghost"
          onClick={() => setUsed([])}
          disabled={used.length === 0}
          style={{ opacity: used.length === 0 ? 0.45 : 1 }}
        >
          Obriši
        </button>
        <button
          className="btn-primary"
          onClick={send}
          disabled={!canSend}
          style={{ opacity: canSend ? 1 : 0.45 }}
        >
          Pošalji reč
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          minHeight: 40,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {[...(my?.myWords ?? [])].reverse().map((w) => (
            <span
              key={w.word}
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 999,
                fontSize: '0.8rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                background: w.word === my?.myBest ? 'rgba(194,155,71,.22)' : 'var(--bg-secondary)',
                border: `1px solid ${w.word === my?.myBest ? 'var(--accent)' : 'transparent'}`,
              }}
            >
              {w.word}
            </span>
          ))}
        </div>
        <button
          onClick={toggleDone}
          style={{
            height: 40,
            minHeight: 40,
            padding: '0 16px',
            borderRadius: 12,
            border: '1.5px solid var(--lime)',
            background: 'transparent',
            color: '#c6dc94',
            fontSize: '0.88rem',
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          Gotov ✓
        </button>
      </div>
    </div>
  );
}

/** Green "Najduža" bar — flashes when a new longest word lands. */
function BestBar({ word }: { word: string }) {
  const n = [...word].length;
  return (
    <div
      key={word}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 16,
        background: 'rgba(169,196,108,.14)',
        border: '1px solid rgba(169,196,108,.35)',
        flexShrink: 0,
        width: '100%',
        animation: 'igra-good-flash .6s ease-out',
      }}
    >
      <span
        style={{
          fontSize: '0.72rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#c6dc94',
        }}
      >
        Najduža
      </span>
      <span
        className="display"
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: 800,
          fontSize: '1.25rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {word}
      </span>
      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#c6dc94' }}>
        {n} {slova(n)}
      </span>
    </div>
  );
}

/** One letter slot of the word being built (or a najava tile). */
function Slot({
  letter,
  count = 7,
  faint,
  onClick,
}: {
  letter?: string;
  count?: number;
  faint?: boolean;
  onClick?: () => void;
}) {
  // 11 slots still fit a 360px phone: shrink with the count.
  const w = count > 9 ? 28 : count > 7 ? 34 : 44;
  const style: React.CSSProperties = {
    width: w,
    minWidth: w,
    height: w + 12,
    minHeight: w + 12,
    padding: 0,
    borderRadius: 12,
    display: 'grid',
    placeItems: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: w > 34 ? '1.75rem' : '1.35rem',
    textTransform: 'uppercase',
    flexShrink: 0,
  };
  if (!letter) {
    return (
      <span
        style={{
          ...style,
          border: `2px dashed ${faint ? 'rgba(245,235,224,.12)' : 'rgba(245,235,224,.25)'}`,
        }}
      />
    );
  }
  const filled = {
    ...style,
    background: 'var(--text-primary)',
    color: 'var(--bg-primary)',
    border: 'none',
  };
  return onClick ? (
    <button onClick={onClick} style={{ ...filled, animation: 'igra-pop .2s' }}>
      {letter}
    </button>
  ) : (
    <span style={filled}>{letter}</span>
  );
}
