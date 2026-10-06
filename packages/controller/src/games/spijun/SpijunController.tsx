import { useEffect, useState, type ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { GameFrame } from '../../components/kit/GameFrame';
import { RoundVerdict, verdictWash } from '../../components/kit/RoundVerdict';
import {
  SPIJUN_QUESTION_TEMPLATES,
  SPIJUN_SHARP_QUESTION_TEMPLATES,
  spijunTutorialControllerHint,
} from '@igra/shared';
import type {
  SpijunControllerData,
  SpijunHostData,
  SpijunPhase,
  SpijunRole,
} from '@igra/shared';
import { TutorialCoach, TutorialDone, TutorialHostCard } from '../../components/kit/Tutorial';

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
  flex: 1,
  gap: '0.8rem',
  textAlign: 'center',
  padding: '1rem 0',
};

const eyebrow: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
};

const darkBtn: React.CSSProperties = {
  minHeight: 48,
  borderRadius: 14,
  border: '1.5px solid transparent',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  fontWeight: 800,
};

export default function SpijunController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const isRemoteHost = usePlayerStore((s) => s.room?.remoteHostPlayerId === s.player?.id);
  const roster = usePlayerStore((s) => s.room?.players ?? []);

  // "Špijunov pomoćnik": locally crossed-out locations (silent — nothing is
  // sent over the wire). Everyone gets the same crossable list, so staring
  // at the phone never singles out the spy. Reset each round.
  const [crossed, setCrossed] = useState<Set<string>>(new Set());
  // Question-generator suggestion (local only).
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [accusePickerOpen, setAccusePickerOpen] = useState(false);
  // "Znam lokaciju!" is irreversible and public — it asks twice.
  const [declareArmed, setDeclareArmed] = useState(false);
  // "sakrij" folds the secret strip away when someone looks over.
  const [secretHidden, setSecretHidden] = useState(false);

  const round = gameState?.round ?? 0;
  useEffect(() => {
    setCrossed(new Set());
    setSuggestion(null);
    setAccusePickerOpen(false);
    setDeclareArmed(false);
    setSecretHidden(false);
  }, [round]);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as SpijunHostData;
  const tutorial = data.tutorialMode === true;
  const my = playerData[playerId] as unknown as SpijunControllerData | undefined;
  const role: SpijunRole = my?.role ?? 'spectator';
  const timed = ['discussion', 'defense', 'voting', 'spy-guess'].includes(phase);

  const tutorialHint = tutorial ? spijunTutorialControllerHint(phase as SpijunPhase, role) : null;
  // Proba (3b/3c): the holder runs it, everyone else gets a personal tip.
  const hostCard = tutorial && isRemoteHost && phase !== 'ended';
  const hintBanner =
    tutorialHint && !hostCard ? (
      <TutorialCoach gameId="spijun" phase={phase} text={tutorialHint} />
    ) : null;

  const nextPhaseButton = hostCard ? (
    <TutorialHostCard
      gameId="spijun"
      phase={phase}
      action="spijun:next-phase"
      tip={tutorialHint}
    />
  ) : null;

  const toggleCross = (name: string) => {
    setCrossed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Crossed-out names sink to the bottom (stable within each group), so the
  // shortlist the spy actually still considers stays at the top of the phone.
  const sortedLocations = [
    ...host.locationNames.filter((n) => !crossed.has(n)),
    ...host.locationNames.filter((n) => crossed.has(n)),
  ];
  const locationsLeft = host.locationNames.length - crossed.size;
  const earlyBonus = host.spyEarlyBonus ?? 0;

  const newSuggestion = (sharp: boolean) => {
    const others = host.players.filter((p) => p.playerId !== playerId);
    if (others.length === 0) return;
    const deck = sharp ? SPIJUN_SHARP_QUESTION_TEMPLATES : SPIJUN_QUESTION_TEMPLATES;
    setSuggestion((prev) => {
      // Reroll rather than repeat the line that is already on screen.
      for (let attempt = 0; attempt < 8; attempt++) {
        const who = others[Math.floor(Math.random() * others.length)];
        const line = deck[Math.floor(Math.random() * deck.length)].replace('{ime}', who.name);
        if (line !== prev) return line;
      }
      return prev;
    });
  };

  // No separate secret card: location + role ride a cream strip at the top
  // of every active screen (private playerData only).
  const secretStrip =
    role === 'spectator' || phase === 'results' || phase === 'ended' ? null : secretHidden ? (
      <button
        onClick={() => setSecretHidden(false)}
        style={{
          ...darkBtn,
          minHeight: 40,
          border: '1.5px dashed var(--line2)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        🔒 Tajna je sakrivena · prikaži
      </button>
    ) : (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 18,
          background: 'var(--text-primary)',
          color: '#1D3557',
          flexShrink: 0,
          animation: 'igra-flip-in .4s ease-out',
        }}
      >
        <span style={{ fontSize: '1.6rem' }}>{role === 'spy' ? '🕵️' : '📍'}</span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span
            className="display"
            style={{
              fontWeight: 800,
              fontSize: '1.35rem',
              lineHeight: 1.05,
              color: role === 'spy' ? '#b8483d' : undefined,
            }}
          >
            {role === 'spy' ? 'Ti si ŠPIJUN' : my?.location}
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b6458' }}>
            {role === 'spy' ? 'Ne znaš lokaciju — slušaj i blefiraj' : `Tvoja uloga: ${my?.roleInLocation}`}
          </span>
        </span>
        <button
          onClick={() => setSecretHidden(true)}
          style={{
            minHeight: 36,
            padding: '0 4px',
            border: 'none',
            background: 'transparent',
            color: '#8a8072',
            fontSize: '0.75rem',
            fontWeight: 800,
          }}
        >
          sakrij
        </button>
      </div>
    );

  let body: ReactNode = null;

  if (phase === 'reveal-role') {
    body =
      role === 'spectator' ? (
        <div style={wrap}>
          <span style={{ fontSize: '2.6rem' }}>👀</span>
          <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Gledaj rundu — uključuješ se sledeće!
          </p>
        </div>
      ) : (
        <div style={wrap}>
          <p className="display" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            {role === 'spy'
              ? 'Ne znaš lokaciju! Slušaj odgovore i pokušaj da je pogodiš.'
              : 'Jedan igrač je špijun i ne zna gde ste.'}
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Nikome ne pokazuj ekran — „sakrij" ga sklanja.
          </p>
        </div>
      );
  } else if (phase === 'discussion') {
    const others = host.players.filter((p) => p.playerId !== playerId);
    const myAccused = my?.accusedTargetId ?? null;
    body = (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flexShrink: 0 }}>
          <button onClick={() => newSuggestion(false)} style={darkBtn}>
            💡 Pitanje
          </button>
          <button onClick={() => newSuggestion(true)} style={{ ...darkBtn, borderColor: 'var(--accent)' }}>
            🔪 Oštro pitanje
          </button>
        </div>
        {suggestion && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 14,
              background: 'rgba(194,155,71,.12)',
              fontSize: '0.95rem',
              fontWeight: 700,
              lineHeight: 1.35,
              flexShrink: 0,
            }}
          >
            {suggestion}
          </div>
        )}

        {/* Location checklist — same for everyone (anti-tell). Taps are local:
            nothing is emitted, so scoring can never depend on them. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={eyebrow}>Lokacije · tapni da precrtaš</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--amber)' }}>
            preostalo {locationsLeft}
            {crossed.size > 0 && (
              <button
                onClick={() => setCrossed(new Set())}
                style={{
                  marginLeft: 8,
                  minHeight: 0,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  textDecoration: 'underline',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                }}
              >
                poništi
              </button>
            )}
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            overflowY: 'auto',
            minHeight: 0,
            flex: 1,
            alignContent: 'start',
          }}
        >
          {sortedLocations.map((n) => {
            const off = crossed.has(n);
            return (
              <button
                key={n}
                onClick={() => toggleCross(n)}
                style={{
                  minHeight: 38,
                  padding: '4px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: off ? 'rgba(245,235,224,.03)' : 'rgba(245,235,224,.07)',
                  color: 'var(--text-primary)',
                  textDecoration: off ? 'line-through' : 'none',
                  opacity: off ? 0.4 : 1,
                  fontSize: '0.88rem',
                  lineHeight: 1.2,
                  fontWeight: 700,
                  textAlign: 'left',
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        {accusePickerOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flexShrink: 0 }}>
            {others.map((p) => {
              const active = myAccused === p.playerId;
              const emoji = roster.find((r) => r.id === p.playerId)?.avatarEmoji;
              return (
                <button
                  key={p.playerId}
                  onClick={() => {
                    emit('spijun:accuse', { targetId: p.playerId });
                    setAccusePickerOpen(false);
                  }}
                  style={{
                    ...darkBtn,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 10px',
                    background: active ? 'var(--danger)' : 'var(--bg-secondary)',
                    color: active ? '#fff' : 'var(--text-primary)',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '30%',
                      background: p.avatarColor,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '0.95rem',
                      flexShrink: 0,
                    }}
                  >
                    {emoji}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                    {active ? ' ✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {myAccused && !accusePickerOpen && (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', flexShrink: 0 }}>
            Sumnjaš na: {host.players.find((p) => p.playerId === myAccused)?.name} ({host.accuseThreshold}{' '}
            glasa pokreće suđenje)
          </p>
        )}

        {/* "Znam lokaciju!" — spy only, from playerData, so the button's mere
            existence never shows on another phone. Two taps: it is public and
            irreversible. */}
        {my?.canDeclare && (
          <button
            onClick={() => {
              if (declareArmed) emit('spijun:declare');
              else setDeclareArmed(true);
            }}
            style={{
              ...darkBtn,
              minHeight: 52,
              background: declareArmed ? 'var(--danger)' : 'var(--bg-secondary)',
              color: declareArmed ? '#fff' : 'var(--amber)',
              borderColor: 'var(--amber)',
              flexShrink: 0,
            }}
          >
            {declareArmed
              ? 'Sigurno? Tapni ponovo — otkrivaš se!'
              : `🎯 Znam lokaciju!${earlyBonus > 0 ? ` (+${earlyBonus})` : ''}`}
          </button>
        )}
        <button
          onClick={() => setAccusePickerOpen((v) => !v)}
          disabled={my?.canAccuse === false}
          style={{
            minHeight: 56,
            borderRadius: 16,
            border: '1.5px solid var(--danger)',
            background: accusePickerOpen ? 'rgba(224,106,94,.18)' : 'transparent',
            color: '#f09a8f',
            fontSize: '1.05rem',
            fontWeight: 800,
            opacity: my?.canAccuse === false ? 0.45 : 1,
            flexShrink: 0,
          }}
        >
          😠 Sumnjiv mi je…
        </button>
        {isRemoteHost && !tutorial && (
          <button
            onClick={() => hostAction('spijun:skip-discussion')}
            style={{ ...darkBtn, minHeight: 40, background: 'transparent', color: 'var(--text-secondary)', flexShrink: 0 }}
          >
            ⏭ Završi razgovor (špijun pogađa)
          </button>
        )}
      </>
    );
  } else if (phase === 'defense') {
    body = (
      <div style={wrap}>
        <span style={{ fontSize: '2.6rem' }}>⚖️</span>
        {my?.isAccused ? (
          <>
            <p className="display" style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--danger)', margin: 0 }}>
              Optužen si — brani se!
            </p>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
              Ubedi ostale da nisi špijun.
            </p>
          </>
        ) : (
          <>
            <p className="display" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
              {host.accusedName} se brani
            </p>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
              Slušaj pažljivo — glasanje sledi!
            </p>
          </>
        )}
      </div>
    );
  } else if (phase === 'voting') {
    if (my?.isAccused) {
      body = (
        <div style={wrap}>
          <span style={{ fontSize: '2.6rem' }}>🗳️</span>
          <p className="display" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
            O tebi se glasa…
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            {host.votedCount}/{host.totalVoters} glasalo
          </p>
        </div>
      );
    } else if (!my?.canVote) {
      body = (
        <div style={wrap}>
          <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Glasanje u toku…
          </p>
        </div>
      );
    } else if (my.hasVoted) {
      body = (
        <div style={wrap}>
          <p className="display" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
            Glas je zabeležen ✓
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            {host.votedCount}/{host.totalVoters} glasalo
          </p>
        </div>
      );
    } else {
      body = (
        <div style={{ ...wrap, justifyContent: 'flex-start', paddingTop: 20 }}>
          <span style={eyebrow}>Tajno glasanje</span>
          <p className="display" style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>
            Da li je {host.accusedName} špijun?
          </p>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
            <button
              onClick={() => emit('spijun:vote', { vote: 'da' })}
              style={{ ...darkBtn, minHeight: 88, background: 'var(--danger)', color: '#fff', fontSize: '1.3rem' }}
            >
              DA 🕵️
            </button>
            <button onClick={() => emit('spijun:vote', { vote: 'ne' })} style={{ ...darkBtn, minHeight: 88, fontSize: '1.3rem' }}>
              NE 🙅
            </button>
          </div>
        </div>
      );
    }
  } else if (phase === 'spy-guess') {
    if (role === 'spy' && my?.canGuess) {
      body = my.hasGuessed ? (
        <div style={wrap}>
          <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Pogodak poslat — čekamo…
          </p>
        </div>
      ) : (
        <>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              Sad ili nikad — koja je lokacija?
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              tačan pogodak +{300 + earlyBonus}
              {earlyBonus > 0 ? ` (300 + ${earlyBonus} za rano prekidanje)` : ''}
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              overflowY: 'auto',
              minHeight: 0,
              flex: 1,
              alignContent: 'start',
            }}
          >
            {sortedLocations.map((n) => {
              const off = crossed.has(n);
              return (
                <button
                  key={n}
                  onClick={() => emit('spijun:spy-guess', { location: n })}
                  style={{
                    minHeight: 48,
                    padding: '4px 12px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'var(--text-primary)',
                    color: 'var(--bg-primary)',
                    fontWeight: 800,
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
        </>
      );
    } else {
      body = (
        <div style={wrap}>
          <span style={{ fontSize: '2.6rem' }}>🕵️</span>
          <p className="display" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
            Špijun je bio {host.spyName}!
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            Sada pogađa lokaciju… drž' palčeve da promaši 🤞
          </p>
        </div>
      );
    }
  } else if (phase === 'results') {
    const roundScore = my?.ownRoundScore ?? 0;
    const outcomeText =
      host.outcome === 'spy-guessed'
        ? `Špijun je pogodio lokaciju (${host.spyGuess})!`
        : host.outcome === 'spy-missed'
          ? 'Špijun nije pogodio — ostali pobeđuju!'
          : host.outcome === 'spy-caught'
            ? 'Špijun je razotkriven!'
            : 'Pogrešna optužba — špijun dobija poene!';
    const won = roundScore > 0;
    body = (
      <div style={{ ...wrap, background: verdictWash(won ? 'correct' : 'wrong') }}>
        <RoundVerdict kind={won ? 'correct' : 'wrong'} icon="🕵️" title={outcomeText} points={roundScore} />
        <p style={{ fontSize: '1rem', margin: 0 }}>
          📍 <strong style={{ color: 'var(--amber)' }}>{host.location}</strong> · špijun:{' '}
          <strong>{host.spyName}</strong>
        </p>
      </div>
    );
  } else if (phase === 'ended') {
    const entry = host.leaderboard?.find((e) => e.playerId === playerId);
    body = (
      <div style={wrap}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>Konačni plasman</p>
        {entry && (
          <>
            <p className="display" style={{ fontSize: '3.4rem', fontWeight: 800, color: 'var(--amber)', margin: 0 }}>
              #{entry.rank}
            </p>
            <p style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>{entry.score.toLocaleString()} poena</p>
          </>
        )}
      </div>
    );
  }

  return (
    <GameFrame
      gameId="spijun"
      subtitle={phase === 'ended' ? 'Kraj igre' : `Runda ${host.round}/${host.totalRounds}`}
      roundCard={{ round: host.round, total: host.totalRounds }}
      timeRemaining={timed ? timeRemaining : undefined}
      roundKey={phase === 'reveal-role' ? host.round : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12, paddingTop: 12 }}>
        {tutorial && data.tutorialDone === true ? (
          <TutorialDone gameId="spijun" />
        ) : (
          <>
            {secretStrip}
            {body}
            {hintBanner}
            {nextPhaseButton}
          </>
        )}
      </div>
    </GameFrame>
  );
}
