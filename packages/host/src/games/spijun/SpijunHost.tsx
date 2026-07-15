import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import { SPIJUN_TUTORIAL_PHASE_TEXT } from '@igra/shared';
import type { SpijunHostData, SpijunPhase } from '@igra/shared';

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function SpijunHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'defense') play('reveal');
      if (phase === 'voting') play('reveal');
      if (phase === 'spy-guess') play('reveal');
      if (phase === 'results') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }
    if (phase === 'defense' || phase === 'voting' || phase === 'spy-guess') {
      const currSec = Math.ceil(timeRemaining);
      const prevSec = Math.ceil(prevTimeRef.current);
      if (currSec !== prevSec && currSec <= 5 && currSec > 0) play('tick');
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as SpijunHostData;
  const tutorial = data.tutorialMode === true;
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';

  const tutorialBanner = tutorial ? (
    <TutorialBanner phase={phase as SpijunPhase} />
  ) : null;

  // --- reveal-role ------------------------------------------------------
  if (phase === 'reveal-role') {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2.6rem', fontWeight: 800, textAlign: 'center' }}
        >
          🕵️ Pogledajte svoje telefone!
        </motion.p>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '640px' }}>
          Svi vide tajnu lokaciju i svoju ulogu — osim <strong>špijuna</strong>.
          Nikome ne pokazujte ekran!
        </p>
        {tutorialBanner}
      </Center>
    );
  }

  // --- discussion -------------------------------------------------------
  if (phase === 'discussion') {
    return (
      <Column>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            Runda {host.round}/{host.totalRounds}
          </span>
          <span
            style={{
              fontWeight: 800,
              fontSize: '2.4rem',
              fontFamily: 'var(--font-display)',
              color: timeRemaining <= 30 ? '#e74c3c' : 'var(--accent)',
            }}
          >
            {formatClock(timeRemaining)}
          </span>
          <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            Pitajte se međusobno — ko ne zna gde ste?
          </span>
        </div>

        <LocationGrid names={host.locationNames} />

        {host.accusationTally && host.accusationTally.length > 0 && (
          <div style={{ width: '100%', maxWidth: '560px' }}>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.4rem' }}>
              Sumnje ({host.accuseThreshold} glasa pokreće suđenje)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {host.accusationTally.map((t) => (
                <div key={t.targetId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ width: '10rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {emojiFor(t.targetId)} {t.name}
                  </span>
                  <div style={{ flex: 1, height: '1.2rem', background: 'var(--bg-secondary)', borderRadius: '0.4rem', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, (t.votes / Math.max(1, host.accuseThreshold ?? 1)) * 100)}%`,
                        height: '100%',
                        background: t.avatarColor,
                        transition: 'width 0.4s',
                      }}
                    />
                  </div>
                  <span style={{ width: '2rem', fontWeight: 700 }}>{t.votes}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tutorialBanner}
      </Column>
    );
  }

  // --- defense ----------------------------------------------------------
  if (phase === 'defense') {
    return (
      <Center>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Optužba! ⚖️</p>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2.6rem', fontWeight: 800, textAlign: 'center' }}
        >
          {emojiFor(host.accusedId ?? '')} {host.accusedName}
        </motion.p>
        <p style={{ fontSize: '1.3rem', textAlign: 'center', maxWidth: '600px' }}>
          ima <strong style={{ color: 'var(--accent)' }}>{timeRemaining}s</strong> da se odbrani — slušajte pažljivo!
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Preostalo vreme razgovora: {formatClock(host.discussionRemaining ?? 0)} (pauzirano)
        </p>
        {tutorialBanner}
      </Center>
    );
  }

  // --- voting -----------------------------------------------------------
  if (phase === 'voting') {
    return (
      <Center>
        <p style={{ fontSize: '2rem', fontWeight: 800, textAlign: 'center' }}>
          Da li je {emojiFor(host.accusedId ?? '')} {host.accusedName} špijun?
        </p>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Tajno glasanje na telefonima · {host.votedCount}/{host.totalVoters} · {timeRemaining}s
        </p>
        {tutorialBanner}
      </Center>
    );
  }

  // --- spy-guess --------------------------------------------------------
  if (phase === 'spy-guess') {
    return (
      <Column>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2.2rem', fontWeight: 800, textAlign: 'center' }}
        >
          🕵️ Špijun je bio {emojiFor(host.spyId ?? '')} {host.spyName}!
        </motion.p>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Sada pogađa lokaciju… {timeRemaining}s
        </p>
        <LocationGrid names={host.locationNames} />
        {tutorialBanner}
      </Column>
    );
  }

  // --- results ----------------------------------------------------------
  if (phase === 'results') {
    const outcomeText =
      host.outcome === 'spy-guessed'
        ? `Špijun je pogodio lokaciju (${host.spyGuess}) — špijun pobeđuje!`
        : host.outcome === 'spy-missed'
          ? host.spyGuess
            ? `Špijun je promašio (rekao je: ${host.spyGuess}) — ostali pobeđuju!`
            : 'Špijun nije pogodio lokaciju — ostali pobeđuju!'
          : host.outcome === 'spy-caught'
            ? 'Špijun je razotkriven glasanjem — ostali pobeđuju!'
            : 'Pogrešna optužba — nevin igrač je izbačen, špijun dobija poene!';
    const outcomeGood =
      host.outcome === 'spy-caught' || host.outcome === 'spy-missed';
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.8rem',
          padding: '1.2rem',
          width: '100%',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds} · Lokacija je bila
        </p>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', textAlign: 'center' }}
        >
          📍 {host.location}
        </motion.p>
        <p style={{ fontSize: '1.3rem', fontWeight: 800 }}>
          Špijun: 🕵️ {emojiFor(host.spyId ?? '')} {host.spyName}
        </p>
        <p
          style={{
            fontSize: '1.3rem',
            fontWeight: 800,
            textAlign: 'center',
            color: outcomeGood ? '#7be37b' : '#e74c3c',
          }}
        >
          {outcomeText}
        </p>
        {(host.voteYes ?? 0) + (host.voteNo ?? 0) > 0 && (
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            Glasanje: {host.voteYes} DA · {host.voteNo} NE
            {host.initiatorName ? ` · optužbu pokrenuo ${host.initiatorName} (+200)` : ''}
          </p>
        )}

        <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {host.results?.map((r) => (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                padding: '0.5rem 0.9rem',
              }}
            >
              <span style={{ fontWeight: r.isSpy ? 800 : 600 }}>
                {r.isSpy ? '🕵️ ' : ''}
                {emojiFor(r.playerId)} {r.name}
              </span>
              <span style={{ fontWeight: 700 }}>
                {r.roundScore > 0 ? `+${r.roundScore}` : '0'}{' '}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                  ({r.totalScore})
                </span>
              </span>
            </div>
          ))}
        </div>
        {tutorialBanner}
      </div>
    );
  }

  // --- ended ------------------------------------------------------------
  if (phase === 'ended' && host.leaderboard) {
    return (
      <Center>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>Konačni poredak</p>
        <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {host.leaderboard.map((entry) => (
            <div
              key={entry.playerId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent)', minWidth: '2ch' }}>
                  #{entry.rank}
                </span>
                <div
                  style={{
                    width: '1.75rem',
                    height: '1.75rem',
                    borderRadius: '50%',
                    background: entry.avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                  }}
                >
                  {emojiFor(entry.playerId)}
                </div>
                <span style={{ fontWeight: 600 }}>{entry.name}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                {entry.score.toLocaleString()} poena
              </span>
            </div>
          ))}
        </div>
      </Center>
    );
  }

  return null;
}

function LocationGrid({ names }: { names: string[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '0.4rem',
        width: '100%',
        maxWidth: '1100px',
        overflowY: 'auto',
        flex: 1,
        minHeight: 0,
        alignContent: 'start',
      }}
    >
      {names.map((n) => (
        <div
          key={n}
          style={{
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '0.45rem 0.7rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {n}
        </div>
      ))}
    </div>
  );
}

function TutorialBanner({ phase }: { phase: SpijunPhase }) {
  const text = SPIJUN_TUTORIAL_PHASE_TEXT[phase];
  if (!text) return null;
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--accent)',
        borderRadius: '10px',
        padding: '0.6rem 1rem',
        fontSize: '0.95rem',
        maxWidth: '720px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
      }}
    >
      🎓 {text}
    </div>
  );
}

function Column({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.8rem',
        padding: '0.8rem',
        width: '100%',
        height: '100%',
      }}
    >
      {children}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
        padding: '1rem',
      }}
    >
      {children}
    </div>
  );
}
