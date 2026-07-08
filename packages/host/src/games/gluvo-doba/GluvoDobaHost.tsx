import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { socket } from '../../socket';
import type { GluvoDobaHostData, GluvoDobaPlayerInfo } from '@igra/shared';
import { GLUVO_DOBA_ROLES } from '@igra/shared';

const ROLE_EMOJI: Record<string, string> = {
  vukodlak: '🐺',
  zmaj: '🐉',
  vidovnjak: '🔮',
  zduhac: '👁️',
  sudjaja: '🧵',
  vila: '🧚',
  domacin: '🌾',
};

function causeText(cause: string): string {
  switch (cause) {
    case 'wolves':
      return 'rastrgnut u gluvo doba noći';
    case 'osveta':
      return 'povučen niti sudbine';
    case 'lynch':
      return 'obešen na seoskom trgu';
    default:
      return 'nestao bez traga';
  }
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
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

function VillageGrid({ players }: { players: GluvoDobaPlayerInfo[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        justifyContent: 'center',
        maxWidth: '900px',
      }}
    >
      {players.map((p) => (
        <span
          key={p.playerId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.75rem',
            borderRadius: '0.6rem',
            background: 'var(--bg-card)',
            border: `2px solid ${p.alive ? p.avatarColor : 'transparent'}`,
            opacity: p.alive ? 1 : 0.4,
            fontWeight: 700,
            textDecoration: p.alive ? 'none' : 'line-through',
          }}
        >
          {p.alive ? p.avatarEmoji : '💀'} {p.name}
        </span>
      ))}
    </div>
  );
}

export default function GluvoDobaHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining, data } = gameState;
    const host = data.host as GluvoDobaHostData | undefined;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'noc') play('night');
      if (phase === 'zora') {
        play('dawn');
        if ((host?.deaths?.length ?? 0) > 0) play('wrong');
      }
      if (phase === 'presuda') play('reveal');
      if (phase === 'kraj') play('victory');
      prevPhaseRef.current = phase;
    }
    if (phase === 'glasanje' || phase === 'diskusija') {
      const currSec = Math.ceil(timeRemaining);
      const prevSec = Math.ceil(prevTimeRef.current);
      if (currSec !== prevSec && currSec <= 5 && currSec > 0) play('tick');
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as GluvoDobaHostData;

  // --- podela-uloga -------------------------------------------------------
  if (phase === 'podela-uloga') {
    return (
      <Center>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0 }}
        >
          🌙 Gluvo doba
        </motion.p>
        <p style={{ fontSize: '1.4rem', color: 'var(--text-secondary)' }}>
          Pogledajte svoje telefone — svako je dobio tajnu ulogu.
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Među vama se kriju vukodlaci. Noću biraju žrtvu, danju glume nevine.
          Selo pobeđuje kad ih sve razotkrije.
        </p>
        <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>{timeRemaining}s</p>
      </Center>
    );
  }

  // --- noc ------------------------------------------------------------------
  if (phase === 'noc') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1.25rem',
          background:
            'radial-gradient(ellipse at 50% 20%, #10233f 0%, #0a1526 70%)',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          style={{ fontSize: '4rem', margin: 0 }}
        >
          🌕
        </motion.p>
        <p style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>
          Noć {host.day} — selo spava
        </p>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Svi gledaju u svoje telefone… niko ne priča. 🤫
        </p>
        <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>
          {host.actedCount}/{host.totalActors} odlučilo · {timeRemaining}s
        </p>
        <VillageGrid players={host.players} />
      </div>
    );
  }

  // --- osveta -----------------------------------------------------------------
  if (phase === 'osveta') {
    return (
      <Center>
        {host.osvetaPublic ? (
          <>
            <p style={{ fontSize: '3rem', margin: 0 }}>🧵</p>
            <motion.p
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}
            >
              Suđaja se sveti!
            </motion.p>
            <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
              Njena nit je presečena — nekoga vodi sa sobom… {timeRemaining}s
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: '3rem', margin: 0 }}>🌙</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>
              Noć se produžava…
            </p>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
              Nešto se mrda u mraku. {timeRemaining}s
            </p>
          </>
        )}
      </Center>
    );
  }

  // --- zora -----------------------------------------------------------------
  if (phase === 'zora') {
    return (
      <Center>
        <p style={{ fontSize: '3rem', margin: 0 }}>🌅</p>
        <p style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>
          Zora — dan {host.day}
        </p>
        {host.deaths && host.deaths.length > 0 ? (
          host.deaths.map((d) => (
            <motion.p
              key={d.playerId}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{ fontSize: '1.5rem', margin: 0 }}
            >
              💀 <strong>{d.name}</strong> —{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                {causeText(d.cause)}
              </span>
              {d.roleId && (
                <>
                  {' '}
                  ({ROLE_EMOJI[d.roleId]} {GLUVO_DOBA_ROLES[d.roleId].name})
                </>
              )}
            </motion.p>
          ))
        ) : (
          <p style={{ fontSize: '1.5rem', margin: 0 }}>
            Selo je osvanulo netaknuto — niko nije stradao! 🕊️
          </p>
        )}
        {host.whisperTop && host.whisperTop.length > 0 && (
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            🌬️ Šapat sumnje kruži selom:{' '}
            {host.whisperTop.map((w) => `${w.name} (${w.count})`).join(' · ')}
          </p>
        )}
        <VillageGrid players={host.players} />
      </Center>
    );
  }

  // --- diskusija ---------------------------------------------------------------
  if (phase === 'diskusija') {
    return (
      <Center>
        <p style={{ fontSize: '2.4rem', fontWeight: 800, margin: 0 }}>
          🗣️ Rasprava
        </p>
        <p
          style={{
            fontSize: timeRemaining <= 10 ? '4rem' : '3rem',
            fontWeight: 800,
            color: timeRemaining <= 10 ? '#e74c3c' : 'var(--accent)',
            margin: 0,
          }}
        >
          {Math.floor(timeRemaining / 60)}:
          {String(timeRemaining % 60).padStart(2, '0')}
        </p>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Ko laže? Ko se noćas čudno ponašao? Raspravljajte uživo!
        </p>
        <VillageGrid players={host.players} />
        <button
          onClick={() =>
            socket.emit('host:game-action', { action: 'gluvo:skip-discussion' })
          }
          style={{
            padding: '0.6rem 1.4rem',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Pređi na glasanje ▶
        </button>
      </Center>
    );
  }

  // --- glasanje ---------------------------------------------------------------
  if (phase === 'glasanje') {
    return (
      <Center>
        <p style={{ fontSize: '2.4rem', fontWeight: 800, margin: 0 }}>
          ⚖️ Glasanje
        </p>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Glasajte na telefonima — koga selo šalje na vešala?
        </p>
        <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
          {host.votedCount}/{host.totalVoters} glasalo ·{' '}
          <span
            style={{
              color: timeRemaining <= 5 ? '#e74c3c' : 'var(--text-primary)',
            }}
          >
            {timeRemaining}s
          </span>
        </p>
        <VillageGrid players={host.players} />
      </Center>
    );
  }

  // --- presuda ----------------------------------------------------------------
  if (phase === 'presuda') {
    const maxVotes = Math.max(1, ...(host.voteTally ?? []).map((v) => v.votes));
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.5rem',
          height: '100%',
          overflowY: 'auto',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>⚖️ Presuda</p>
        {host.lynched ? (
          <motion.p
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: '1.8rem', margin: 0 }}
          >
            Selo je obesilo{' '}
            <strong style={{ color: '#e74c3c' }}>{host.lynched.name}</strong>
            {host.lynched.roleId && (
              <>
                {' '}
                ({ROLE_EMOJI[host.lynched.roleId]}{' '}
                {GLUVO_DOBA_ROLES[host.lynched.roleId].name})
              </>
            )}
          </motion.p>
        ) : (
          <p style={{ fontSize: '1.6rem', margin: 0 }}>
            Selo nije odlučilo — niko nije obešen. 🤷
          </p>
        )}
        {host.osvetaVictim && (
          <motion.p
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{ fontSize: '1.4rem', margin: 0 }}
          >
            🧵 Suđaja je povukla nit — <strong>{host.osvetaVictim.name}</strong>{' '}
            odlazi sa njom!
          </motion.p>
        )}
        {host.deaths &&
          host.deaths
            .filter((d) => d.cause === 'disappeared')
            .map((d) => (
              <p
                key={d.playerId}
                style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', margin: 0 }}
              >
                👣 {d.name} — nestao bez traga
              </p>
            ))}
        {host.voteTally && host.voteTally.length > 0 && (
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            {host.voteTally.map((v) => (
              <div
                key={v.playerId}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <span style={{ width: '9rem', textAlign: 'right', fontWeight: 600 }}>
                  {v.name}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: '1.4rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '0.4rem',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(v.votes / maxVotes) * 100}%`,
                      height: '100%',
                      background: 'var(--accent)',
                      transition: 'width 0.4s',
                    }}
                  />
                </div>
                <span style={{ width: '2rem', fontWeight: 700 }}>{v.votes}</span>
              </div>
            ))}
            {(host.skipVotes ?? 0) > 0 && (
              <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
                Preskok: {host.skipVotes}
              </p>
            )}
          </div>
        )}
        <VillageGrid players={host.players} />
      </div>
    );
  }

  // --- kraj / ended ---------------------------------------------------------------
  if (phase === 'kraj' || phase === 'ended') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.5rem',
          height: '100%',
          overflowY: 'auto',
          textAlign: 'center',
        }}
      >
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '3rem', margin: 0 }}
        >
          {host.winner === 'vukodlaci' ? '🐺' : '🌾'}
        </motion.p>
        <p style={{ fontSize: '2.4rem', fontWeight: 800, margin: 0 }}>
          {host.winner === 'vukodlaci'
            ? 'Vukodlaci su pobedili!'
            : 'Selo je pobedilo!'}
        </p>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', margin: 0 }}>
          Ko je bio ko:
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            width: '100%',
            maxWidth: '480px',
          }}
        >
          {host.finalRoles?.map((r) => (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                opacity: r.alive ? 1 : 0.65,
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {r.avatarEmoji} {r.name} {!r.alive && '💀'}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  color:
                    GLUVO_DOBA_ROLES[r.roleId].team === 'vukodlaci'
                      ? '#e74c3c'
                      : 'var(--accent)',
                }}
              >
                {ROLE_EMOJI[r.roleId]} {GLUVO_DOBA_ROLES[r.roleId].name}
              </span>
            </div>
          ))}
        </div>
        {phase === 'kraj' && (
          <button
            onClick={() =>
              socket.emit('host:game-action', { action: 'gluvo:end-now' })
            }
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Nazad u sobu ({timeRemaining}s) ▶
          </button>
        )}
      </div>
    );
  }

  return null;
}
