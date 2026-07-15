import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import {
  SPIJUN_QUESTION_TEMPLATES,
  spijunTutorialControllerHint,
} from '@igra/shared';
import type {
  SpijunControllerData,
  SpijunHostData,
  SpijunPhase,
  SpijunRole,
} from '@igra/shared';

function emit(action: string, data: Record<string, unknown> = {}) {
  socket.emit('game:player-action', { action, data });
}

function hostAction(action: string) {
  socket.emit('host:game-action', { action });
}

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '1rem',
  textAlign: 'center',
  padding: '1rem',
};

const column: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  padding: '0.75rem',
  gap: '0.6rem',
  overflowY: 'auto',
};

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function SpijunController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const isRemoteHost = usePlayerStore(
    (s) => s.room?.remoteHostPlayerId === s.player?.id
  );

  // "Špijunov pomoćnik": locally crossed-out locations (silent — nothing is
  // sent over the wire). Everyone gets the same crossable list, so staring
  // at the phone never singles out the spy. Reset each round.
  const [crossed, setCrossed] = useState<Set<string>>(new Set());
  // Question-generator suggestion (local only).
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [accusePickerOpen, setAccusePickerOpen] = useState(false);

  const round = gameState?.round ?? 0;
  useEffect(() => {
    setCrossed(new Set());
    setSuggestion(null);
    setAccusePickerOpen(false);
  }, [round]);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as SpijunHostData;
  const tutorial = data.tutorialMode === true;
  const my = playerData[playerId] as unknown as SpijunControllerData | undefined;
  const role: SpijunRole = my?.role ?? 'spectator';

  const tutorialHint = tutorial
    ? spijunTutorialControllerHint(phase as SpijunPhase, role)
    : null;
  const hintBanner = tutorialHint ? (
    <p
      style={{
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        background: 'var(--bg-card)',
        border: '1px solid var(--accent)',
        borderRadius: '10px',
        padding: '0.5rem 0.75rem',
        margin: 0,
        textAlign: 'center',
      }}
    >
      🎓 {tutorialHint}
    </p>
  ) : null;

  const nextPhaseButton =
    tutorial && isRemoteHost && phase !== 'ended' ? (
      <button
        onClick={() => hostAction('spijun:next-phase')}
        style={{
          padding: '0.6rem 1rem',
          borderRadius: '10px',
          border: '1px solid var(--accent)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontWeight: 700,
          fontSize: '0.9rem',
        }}
      >
        Sledeća faza ▸
      </button>
    ) : null;

  const toggleCross = (name: string) => {
    setCrossed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const newSuggestion = () => {
    const others = host.players.filter((p) => p.playerId !== playerId);
    if (others.length === 0) return;
    const who = others[Math.floor(Math.random() * others.length)];
    const template =
      SPIJUN_QUESTION_TEMPLATES[
        Math.floor(Math.random() * SPIJUN_QUESTION_TEMPLATES.length)
      ];
    setSuggestion(template.replace('{ime}', who.name));
  };

  // My secret line, shown on every active-phase screen (private playerData).
  const secretLine =
    role === 'spy' ? (
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '10px',
          padding: '0.5rem 0.75rem',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--danger)' }}>
          🕵️ Ti si ŠPIJUN
        </p>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Ne znaš lokaciju — blefiraj i eliminiši!
        </p>
      </div>
    ) : role === 'player' ? (
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '10px',
          padding: '0.5rem 0.75rem',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--accent)' }}>
          📍 {my?.location}
        </p>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Tvoja uloga: <strong>{my?.roleInLocation}</strong>
        </p>
      </div>
    ) : null;

  // --- reveal-role ------------------------------------------------------
  if (phase === 'reveal-role') {
    if (role === 'spy') {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2.4rem' }}>🕵️</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)' }}>
            Ti si ŠPIJUN
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Ne znaš lokaciju! Slušaj odgovore, blefiraj i pokušaj da je pogodiš.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Nikome ne pokazuj ekran!
          </p>
          {hintBanner}
          {nextPhaseButton}
        </div>
      );
    }
    if (role === 'player') {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2.4rem' }}>📍</p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Lokacija:
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', margin: 0 }}>
            {my?.location}
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Tvoja uloga:
          </p>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
            {my?.roleInLocation}
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Jedan igrač je špijun i ne zna gde ste. Nikome ne pokazuj ekran!
          </p>
          {hintBanner}
          {nextPhaseButton}
        </div>
      );
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1.2rem' }}>Gledaj rundu — uključuješ se sledeće!</p>
      </div>
    );
  }

  // --- discussion -------------------------------------------------------
  if (phase === 'discussion') {
    const others = host.players.filter((p) => p.playerId !== playerId);
    const myAccused = my?.accusedTargetId ?? null;
    return (
      <div style={column}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
            {formatClock(timeRemaining)}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Runda {host.round}/{host.totalRounds}
          </span>
        </div>
        {secretLine}
        {hintBanner}

        {/* Question generator */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={newSuggestion}
            style={{
              flex: 1,
              padding: '0.55rem 0.6rem',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            💡 Predlog pitanja
          </button>
          <button
            onClick={() => setAccusePickerOpen((v) => !v)}
            disabled={my?.canAccuse === false}
            style={{
              flex: 1,
              padding: '0.55rem 0.6rem',
              borderRadius: '10px',
              border: 'none',
              background: accusePickerOpen ? 'var(--danger)' : 'var(--bg-card)',
              color: accusePickerOpen ? '#fff' : 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.85rem',
              opacity: my?.canAccuse === false ? 0.5 : 1,
            }}
          >
            😠 Sumnjiv mi je…
          </button>
        </div>
        {suggestion && (
          <p
            style={{
              margin: 0,
              fontSize: '0.85rem',
              background: 'var(--bg-card)',
              borderRadius: '10px',
              padding: '0.5rem 0.75rem',
              textAlign: 'center',
            }}
          >
            {suggestion}
          </p>
        )}

        {/* Accusation picker */}
        {accusePickerOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {others.map((p) => {
              const active = myAccused === p.playerId;
              return (
                <button
                  key={p.playerId}
                  onClick={() => {
                    emit('spijun:accuse', { targetId: p.playerId });
                    setAccusePickerOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.65rem 0.9rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: active ? 'var(--danger)' : 'var(--bg-card)',
                    color: active ? '#fff' : 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    borderLeft: `6px solid ${p.avatarColor}`,
                  }}
                >
                  {p.name}
                  {active ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        )}
        {myAccused && !accusePickerOpen && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            Sumnjaš na: {host.players.find((p) => p.playerId === myAccused)?.name}
            {' '}({host.accuseThreshold} glasa pokreće suđenje)
          </p>
        )}

        {/* Location checklist — same for everyone (anti-tell). Taps are local. */}
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Lokacije (tapni da precrtaš — vidi samo tvoj telefon):
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {host.locationNames.map((n) => {
            const off = crossed.has(n);
            return (
              <button
                key={n}
                onClick={() => toggleCross(n)}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--bg-card)',
                  color: off ? 'var(--text-secondary)' : 'var(--text-primary)',
                  textDecoration: off ? 'line-through' : 'none',
                  opacity: off ? 0.5 : 1,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        {isRemoteHost && !tutorial && (
          <button
            onClick={() => hostAction('spijun:skip-discussion')}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '10px',
              border: '1px solid var(--bg-card)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
          >
            ⏭ Završi razgovor (špijun pogađa)
          </button>
        )}
        {nextPhaseButton}
      </div>
    );
  }

  // --- defense ----------------------------------------------------------
  if (phase === 'defense') {
    return (
      <div style={wrap}>
        {my?.isAccused ? (
          <>
            <p style={{ fontSize: '2rem' }}>⚖️</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--danger)' }}>
              Optužen si — brani se!
            </p>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
              Imaš {timeRemaining}s da ubediš ostale da nisi špijun.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: '2rem' }}>⚖️</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              {host.accusedName} se brani ({timeRemaining}s)
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Slušaj pažljivo — glasanje sledi!
            </p>
          </>
        )}
        {secretLine}
        {hintBanner}
        {nextPhaseButton}
      </div>
    );
  }

  // --- voting -----------------------------------------------------------
  if (phase === 'voting') {
    if (my?.isAccused) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2rem' }}>🗳️</p>
          <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>O tebi se glasa…</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.votedCount}/{host.totalVoters} glasalo
          </p>
          {hintBanner}
        </div>
      );
    }
    if (!my?.canVote) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.2rem' }}>Glasanje u toku…</p>
        </div>
      );
    }
    if (my.hasVoted) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.2rem' }}>Glas je zabeležen ✓</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.votedCount}/{host.totalVoters} glasalo
          </p>
          {nextPhaseButton}
        </div>
      );
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>
          Da li je {host.accusedName} špijun?
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          Tajno glasanje · {timeRemaining}s
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', width: '100%', maxWidth: '320px' }}>
          <button
            onClick={() => emit('spijun:vote', { vote: 'da' })}
            style={{
              flex: 1,
              padding: '1.2rem 0.5rem',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--danger)',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1.2rem',
            }}
          >
            DA 🕵️
          </button>
          <button
            onClick={() => emit('spijun:vote', { vote: 'ne' })}
            style={{
              flex: 1,
              padding: '1.2rem 0.5rem',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 800,
              fontSize: '1.2rem',
            }}
          >
            NE 🙅
          </button>
        </div>
        {hintBanner}
      </div>
    );
  }

  // --- spy-guess --------------------------------------------------------
  if (phase === 'spy-guess') {
    if (role === 'spy' && my?.canGuess) {
      if (my.hasGuessed) {
        return (
          <div style={wrap}>
            <p style={{ fontSize: '1.2rem' }}>Pogodak poslat — čekamo…</p>
          </div>
        );
      }
      return (
        <div style={column}>
          <p style={{ fontSize: '1.15rem', fontWeight: 800, textAlign: 'center', margin: 0 }}>
            🕵️ Sad ili nikad — koja je lokacija?
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
            {timeRemaining}s · tačan pogodak +300
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {host.locationNames.map((n) => {
              const off = crossed.has(n);
              return (
                <button
                  key={n}
                  onClick={() => emit('spijun:spy-guess', { location: n })}
                  style={{
                    padding: '0.65rem 0.75rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textAlign: 'left',
                    textDecoration: off ? 'line-through' : 'none',
                    opacity: off ? 0.45 : 1,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2rem' }}>🕵️</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>
          Špijun je bio {host.spyName}!
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Sada pogađa lokaciju… drž' palčeve da promaši 🤞
        </p>
        {hintBanner}
        {nextPhaseButton}
      </div>
    );
  }

  // --- results ----------------------------------------------------------
  if (phase === 'results') {
    const roundScore = my?.ownRoundScore ?? 0;
    const outcomeText =
      host.outcome === 'spy-guessed'
        ? `Špijun je pogodio lokaciju (${host.spyGuess})!`
        : host.outcome === 'spy-missed'
          ? 'Špijun nije pogodio — ostali pobeđuju!'
          : host.outcome === 'spy-caught'
            ? 'Špijun je razotkriven!'
            : 'Pogrešna optužba — špijun dobija poene!';
    return (
      <div style={wrap}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Lokacija je bila
        </p>
        <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', margin: 0 }}>
          📍 {host.location}
        </p>
        <p style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
          Špijun: 🕵️ {host.spyName}
        </p>
        <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>{outcomeText}</p>
        <p
          style={{
            fontSize: '1.3rem',
            fontWeight: 800,
            color: roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
          }}
        >
          {role === 'spy' ? '🕵️ ' : ''}
          {roundScore > 0 ? `+${roundScore}` : '+0'} poena
        </p>
        {hintBanner}
        {nextPhaseButton}
      </div>
    );
  }

  // --- ended ------------------------------------------------------------
  if (phase === 'ended') {
    const entry = host.leaderboard?.find((e) => e.playerId === playerId);
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Konačni plasman
        </p>
        {entry && (
          <>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
              #{entry.rank}
            </p>
            <p style={{ fontSize: '1.4rem', fontWeight: 600 }}>
              {entry.score.toLocaleString()} poena
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}
