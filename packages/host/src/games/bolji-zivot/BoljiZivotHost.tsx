import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { socket } from '../../socket';
import type { BoljiZivotHostData, BZFamilyPublic } from '@igra/shared';
import { BZ_POWER_TEXT, BZ_TUTORIAL_PHASE_TEXT } from '@igra/shared';
import { BZCardFace, BZCardBack, BZCardGap } from './components/BZCard';

// In-game ekrani su namerno samo na srpskom (kao Kviz/Lažov klasa igara).

export default function BoljiZivotHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevActionIdRef = useRef<number>(0);

  const data = (gameState?.data ?? null) as BoljiZivotHostData | null;

  useEffect(() => {
    if (!gameState || !data) return;
    const phase = gameState.phase;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'racija-show') play('wrong');
      if (phase === 'riska') play('reveal');
      if (phase === 'reveal') play('reveal');
      if (phase === 'final-leaderboard') play('victory');
      prevPhaseRef.current = phase;
    }
    if (data.lastActionId !== prevActionIdRef.current) {
      prevActionIdRef.current = data.lastActionId;
      if (data.slap) play('tick');
    }
  }, [gameState, data, play]);

  if (!gameState || !data) return null;

  const { phase, timeRemaining } = gameState;
  const tutorial = data.tutorialMode;

  if (phase === 'final-leaderboard' || phase === 'ended') {
    return <FinalBoard data={data} />;
  }

  if (phase === 'reveal') {
    return <RevealBoard data={data} timeRemaining={timeRemaining} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '1.5rem',
        width: '100%',
        maxWidth: '1100px',
      }}
    >
      {/* Zaglavlje */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          color: 'var(--text-secondary)',
          fontSize: '1.05rem',
        }}
      >
        <span>
          Runda {data.roundNumber}/{data.totalRounds}
        </span>
        <span style={{ opacity: 0.5 }}>•</span>
        <span>{phaseLabel(phase, data)}</span>
        <span style={{ opacity: 0.5 }}>•</span>
        {tutorial ? (
          <span
            style={{
              fontWeight: 700,
              color: 'var(--accent)',
              border: '1px solid rgba(194,155,71,0.5)',
              borderRadius: '999px',
              padding: '0.1rem 0.7rem',
              fontSize: '0.9rem',
            }}
          >
            🎓 Tutorial
          </span>
        ) : (
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: '1.3rem',
              color: timeRemaining <= 5 ? 'var(--danger)' : 'var(--text-primary)',
            }}
          >
            {timeRemaining}s
          </span>
        )}
      </div>

      {/* Tutorial: fazni vodič + ručno pomeranje faza */}
      {tutorial && <TutorialBar phase={phase} />}

      {/* Poslednji događaj na stolu */}
      <AnimatePresence mode="popLayout">
        {data.lastAction && (
          <motion.p
            key={data.lastActionId}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="display"
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              margin: 0,
              textAlign: 'center',
              color: 'var(--accent)',
              minHeight: '1.6rem',
            }}
          >
            {data.lastAction}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Slap prozor */}
      {data.slap && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            background: 'rgba(231, 76, 60, 0.18)',
            border: '2px solid var(--danger)',
            borderRadius: '0.75rem',
            padding: '0.5rem 1.25rem',
            fontWeight: 700,
            fontSize: '1.1rem',
          }}
        >
          ⚡ Ko ima {data.slap.value} — tapni „!" na telefonu, dok sledeći igrač ne povuče!
        </motion.div>
      )}

      {/* Zduhać / reaction prozor */}
      {data.reaction && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            background: 'rgba(194, 155, 71, 0.15)',
            border: '2px solid var(--accent)',
            borderRadius: '0.75rem',
            padding: '0.5rem 1.25rem',
            fontWeight: 700,
            fontSize: '1.05rem',
            textAlign: 'center',
          }}
        >
          🛡️ {data.reaction.targetName} — imaš li Zduhaća? On presreće i
          poništava akciju! ({timeRemaining}s)
        </motion.div>
      )}

      {/* Drekavac momenat */}
      {phase === 'riska' && data.riska && (
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            background: 'var(--bg-card)',
            border: '3px solid var(--accent)',
            borderRadius: '1rem',
            padding: '1rem 2rem',
            textAlign: 'center',
          }}
        >
          <p className="display" style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
            😱 DREKAVAC VRIŠTI!
          </p>
          <p style={{ margin: '0.4rem 0 0', color: 'var(--text-secondary)' }}>
            {data.riska.holderName} ima jedan dodatni potez — Drekavac ne odlazi tiho
          </p>
        </motion.div>
      )}

      {/* Centar: špil + otpad */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          {/* Puls na promenu broja karata = neko je upravo vukao. */}
          <motion.div
            key={data.drawCount}
            initial={{ scale: 1.12, rotate: -4 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 18 }}
            style={{
              width: 84,
              height: 118,
              borderRadius: 10,
              background:
                'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%)',
              border: '2px solid rgba(194,155,71,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}
          >
            🧿
          </motion.div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
            Špil · {data.drawCount}
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {data.discardTop ? (
              <motion.div
                key={`${data.discardCount}-${data.discardTop.v}-${data.discardTop.name}`}
                initial={{ rotateY: 90, scale: 1.18, y: -10 }}
                animate={{ rotateY: 0, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.35 }}
              >
                <BZCardFace v={data.discardTop.v} name={data.discardTop.name} size={84} />
              </motion.div>
            ) : (
              <BZCardGap size={84} />
            )}
          </AnimatePresence>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
            Otpad · {data.discardCount}
          </p>
        </div>
      </div>

      {/* Porodice */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '0.9rem',
          width: '100%',
        }}
      >
        {data.families.map((fam) => (
          <FamilyPanel key={fam.playerId} fam={fam} data={data} />
        ))}
      </div>
    </div>
  );
}

// Faze u kojima se čeka odluka igrača — "Sledeća faza" tu znači "preskoči
// potez" (izvršava se isto što i istek tajmera), pa dugme menja tekst.
const BZ_INPUT_PHASES = new Set([
  'peeking',
  'await-draw',
  'holding',
  'power-select',
  'power-look',
  'reaction',
  'riska',
]);

function TutorialNextButton({ label }: { label: string }) {
  return (
    <button
      onClick={() =>
        socket.emit('host:game-action', { action: 'bz:next-phase' })
      }
      style={{
        padding: '0.45rem 1.1rem',
        borderRadius: '0.6rem',
        background: 'var(--accent)',
        color: '#fff',
        fontWeight: 700,
        fontSize: '0.9rem',
      }}
    >
      {label}
    </button>
  );
}

/** Tutorial traka na TV-u: objašnjenje tekuće faze + ručno pomeranje. */
function TutorialBar({ phase }: { phase: string }) {
  const hint = BZ_TUTORIAL_PHASE_TEXT[phase as keyof typeof BZ_TUTORIAL_PHASE_TEXT];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'rgba(194,155,71,0.1)',
        border: '1px solid rgba(194,155,71,0.35)',
        borderRadius: '0.75rem',
        padding: '0.6rem 1rem',
        maxWidth: '900px',
        width: '100%',
      }}
    >
      <span style={{ fontSize: '1.3rem' }}>🎓</span>
      <p
        style={{
          margin: 0,
          flex: 1,
          fontSize: '0.95rem',
          color: 'var(--text-primary)',
          lineHeight: 1.4,
        }}
      >
        {hint ?? 'Vođena partija — faze pomera voditelj.'}
      </p>
      <TutorialNextButton
        label={BZ_INPUT_PHASES.has(phase) ? 'Preskoči potez ▸' : 'Sledeća faza ▸'}
      />
    </div>
  );
}

function phaseLabel(phase: string, data: BoljiZivotHostData): string {
  switch (phase) {
    case 'peeking':
      return 'Svako gleda 2 svoje karte';
    case 'await-draw':
      return `Na potezu: ${data.currentPlayerName ?? '…'}`;
    case 'holding':
      return `${data.currentPlayerName ?? '…'} drži kartu`;
    case 'power-select':
      return data.power
        ? `${data.power.actorName}: ${BZ_POWER_TEXT[data.power.kind]}`
        : 'Bira se meta moći';
    case 'power-look':
      return `${data.power?.actorName ?? '…'} odlučuje — zameni ili ostavi`;
    case 'peek-show':
      return `${data.currentPlayerName ?? '…'} pamti viđeno…`;
    case 'racija-show':
      return '⚡ GROM — karte na sto!';
    case 'reaction':
      return 'Zduhać prozor';
    case 'riska':
      return 'Drekavac vrišti';
    default:
      return '';
  }
}

function FamilyPanel({
  fam,
  data,
}: {
  fam: BZFamilyPublic;
  data: BoljiZivotHostData;
}) {
  const isCurrent = data.currentPlayerId === fam.playerId;
  const racijaByPos = new Map(
    (data.racija?.reveals ?? [])
      .filter((r) => r.playerId === fam.playerId)
      .map((r) => [r.pos, r])
  );
  const failedByPos = new Map(
    (data.slap?.failed ?? [])
      .filter((r) => r.playerId === fam.playerId)
      .map((r) => [r.pos, r])
  );
  const changed = new Set(
    data.changedSlots
      .filter((c) => c.playerId === fam.playerId)
      .map((c) => c.pos)
  );

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '0.9rem',
        padding: '0.75rem',
        border: isCurrent
          ? '2px solid var(--accent)'
          : '2px solid transparent',
        opacity: fam.connected ? 1 : 0.5,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <span style={{ fontSize: '1.2rem' }}>{fam.avatarEmoji ?? '🙂'}</span>
        <span
          style={{
            fontWeight: 700,
            color: fam.avatarColor,
            fontSize: '1.05rem',
          }}
        >
          {fam.name}
        </span>
        {fam.isCaller && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '999px',
              padding: '0.1rem 0.5rem',
            }}
          >
            ZAVET!
          </span>
        )}
        {isCurrent && data.sub === 'holding' && (
          <motion.span
            initial={{ scale: 0, y: -6 }}
            animate={{ scale: 1, y: 0 }}
            style={{
              marginLeft: 'auto',
              fontSize: '0.72rem',
              fontWeight: 700,
              background: 'rgba(194,155,71,0.2)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              borderRadius: '999px',
              padding: '0.15rem 0.55rem',
            }}
          >
            🎴 drži kartu
          </motion.span>
        )}
        {isCurrent && data.sub !== 'holding' && (
          <span style={{ marginLeft: 'auto', fontSize: '1.1rem' }}>▶</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {fam.slots.map((slot) => {
          if (!slot.present) return <BZCardGap key={slot.pos} size={58} />;
          const racija = racijaByPos.get(slot.pos);
          const failed = failedByPos.get(slot.pos);
          const face = racija ?? failed;
          if (face) {
            return (
              <motion.div
                key={slot.pos}
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
              >
                <BZCardFace v={face.v} name={face.name} size={58} />
              </motion.div>
            );
          }
          if (changed.has(slot.pos)) {
            // Prodrmaj kartu dirnutu poslednjom akcijom — jasno se vidi
            // ČIJA karta i NA KOM mestu se upravo promenila.
            return (
              <motion.div
                key={`${slot.pos}-${data.lastActionId}`}
                animate={{
                  rotate: [0, -7, 7, -5, 5, 0],
                  scale: [1, 1.12, 1.12, 1.06, 1],
                }}
                transition={{ duration: 0.55 }}
              >
                <BZCardBack pos={slot.pos} size={58} highlight />
              </motion.div>
            );
          }
          return <BZCardBack key={slot.pos} pos={slot.pos} size={58} />;
        })}
      </div>
    </div>
  );
}

function RevealBoard({
  data,
  timeRemaining,
}: {
  data: BoljiZivotHostData;
  timeRemaining: number;
}) {
  const reveal = data.reveal;
  if (!reveal) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '1.5rem',
        width: '100%',
        maxWidth: '1000px',
      }}
    >
      <p className="display" style={{ fontSize: '1.9rem', fontWeight: 700, margin: 0 }}>
        {reveal.callerId
          ? reveal.callerSuccess
            ? `🏆 ${reveal.callerName} — ZAVET je uspeo!`
            : `💥 ${reveal.callerName} je pao — +20 uroka kazne!`
          : 'Runda je istekla — otkrivanje!'}
      </p>
      {data.tutorialMode ? (
        <TutorialBar phase="reveal" />
      ) : (
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Runda {data.roundNumber}/{data.totalRounds} · sledeća za {timeRemaining}s
        </p>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.7rem',
          width: '100%',
        }}
      >
        {[...reveal.families]
          .sort((a, b) => a.roundSum - b.roundSum)
          .map((fam) => {
            const isWinner = reveal.winnerIds.includes(fam.playerId);
            return (
              <div
                key={fam.playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.9rem',
                  background: 'var(--bg-card)',
                  borderRadius: '0.9rem',
                  padding: '0.6rem 0.9rem',
                  border: isWinner
                    ? '2px solid var(--success)'
                    : '2px solid transparent',
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color: fam.avatarColor,
                    minWidth: '110px',
                  }}
                >
                  {fam.name}
                  {fam.isCaller ? ' 📣' : ''}
                </span>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {fam.cards.map((c) => (
                    <BZCardFace
                      key={c.pos}
                      v={c.v}
                      name={c.name}
                      size={52}
                      paired={c.paired}
                    />
                  ))}
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <p
                    className="display"
                    style={{
                      fontSize: '1.4rem',
                      fontWeight: 700,
                      margin: 0,
                      color: isWinner ? 'var(--success)' : 'var(--text-primary)',
                    }}
                  >
                    {fam.roundSum} 🧿
                  </p>
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      margin: 0,
                    }}
                  >
                    +{fam.scoreAdded} → ukupno {fam.totalScore}
                  </p>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function FinalBoard({ data }: { data: BoljiZivotHostData }) {
  const entries = data.leaderboard ?? [];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '640px',
      }}
    >
      <p className="display" style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>
        🧿 Najmanje uroka
      </p>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        Manje je bolje — pobednik je na vrhu!
      </p>
      {data.tutorialMode && data.sub === 'final-leaderboard' && (
        <TutorialNextButton label="Završi igru ▸" />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
        {entries.map((e) => (
          <motion.div
            key={e.playerId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: e.rank * 0.15 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'var(--bg-card)',
              borderRadius: '0.75rem',
              padding: '0.7rem 1rem',
              border:
                e.rank === 1 ? '2px solid var(--success)' : '2px solid transparent',
            }}
          >
            <span
              className="display"
              style={{ fontSize: '1.3rem', fontWeight: 700, minWidth: '2.2rem' }}
            >
              {e.rank === 1 ? '🏆' : `#${e.rank}`}
            </span>
            <span style={{ fontWeight: 700, color: e.avatarColor }}>{e.name}</span>
            <span
              className="display"
              style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '1.2rem' }}
            >
              {e.score} 🧿
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
