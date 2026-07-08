import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import type {
  GluvoDobaControllerData,
  GluvoDobaHostData,
  GluvoDobaTargetOption,
} from '@igra/shared';
import { GLUVO_DOBA_ROLES } from '@igra/shared';

function emit(action: string, data: Record<string, unknown>) {
  socket.emit('game:player-action', { action, data });
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
  padding: '1rem',
  gap: '0.75rem',
};

const ROLE_EMOJI: Record<string, string> = {
  vukodlak: '🐺',
  zmaj: '🐉',
  vidovnjak: '🔮',
  zduhac: '👁️',
  sudjaja: '🧵',
  vila: '🧚',
  domacin: '🌾',
};

function CauseLabel({ cause }: { cause: string }) {
  const text =
    cause === 'wolves'
      ? 'rastrgnut u gluvo doba'
      : cause === 'osveta'
        ? 'povučen niti sudbine'
        : cause === 'lynch'
          ? 'obešen na trgu'
          : 'nestao bez traga';
  return <span style={{ color: 'var(--text-secondary)' }}>({text})</span>;
}

function TargetGrid({
  prompt,
  targets,
  onPick,
  extraOption,
  timeRemaining,
}: {
  prompt: string;
  targets: GluvoDobaTargetOption[];
  onPick: (targetId: string) => void;
  extraOption?: { id: string; label: string };
  timeRemaining: number;
}) {
  // One shared layout for every night role — from across the room every
  // phone looks identical, only the small prompt text differs.
  return (
    <div style={column}>
      <p style={{ fontSize: '1.2rem', fontWeight: 800, textAlign: 'center', margin: 0 }}>
        {prompt}
      </p>
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          margin: 0,
        }}
      >
        {timeRemaining}s
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          overflowY: 'auto',
        }}
      >
        {targets.map((o) => (
          <button
            key={o.playerId}
            onClick={() => onPick(o.playerId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.85rem 1rem',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '1.05rem',
              borderLeft: `6px solid ${o.avatarColor}`,
            }}
          >
            <span>{o.avatarEmoji}</span>
            {o.name}
          </button>
        ))}
        {extraOption && (
          <button
            onClick={() => onPick(extraOption.id)}
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '12px',
              border: '2px dashed var(--text-secondary)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            {extraOption.label}
          </button>
        )}
      </div>
    </div>
  );
}

function GhostView({
  my,
  timeRemaining,
  isNight,
}: {
  my: GluvoDobaControllerData;
  timeRemaining: number;
  isNight: boolean;
}) {
  return (
    <div style={{ ...column, overflowY: 'auto' }}>
      <p style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', margin: 0 }}>
        👻 Mrtav si — ali vidiš sve
      </p>
      {isNight && my.ghostQuestion && (
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '12px',
            padding: '0.85rem',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Zduhać pita: da li je{' '}
            <strong>{my.ghostQuestion.targetName}</strong> vukodlak?
          </p>
          {my.hasGhostVoted ? (
            <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)' }}>
              Odgovorio si. ({timeRemaining}s)
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginTop: '0.6rem',
                justifyContent: 'center',
              }}
            >
              <button
                onClick={() => emit('gluvo:ghost-vote', { vote: 'da' })}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--danger)',
                  color: '#fff',
                  fontWeight: 800,
                }}
              >
                DA
              </button>
              <button
                onClick={() => emit('gluvo:ghost-vote', { vote: 'ne' })}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--success)',
                  color: '#fff',
                  fontWeight: 800,
                }}
              >
                NE
              </button>
            </div>
          )}
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            Mrtvi vukodlaci smeju da lažu…
          </p>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {my.allRoles?.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-card)',
              borderRadius: '10px',
              fontSize: '0.95rem',
            }}
          >
            <span>{r.name}</span>
            <span
              style={{
                fontWeight: 700,
                color:
                  GLUVO_DOBA_ROLES[r.roleId].team === 'vukodlaci'
                    ? 'var(--danger)'
                    : 'var(--text-secondary)',
              }}
            >
              {ROLE_EMOJI[r.roleId]} {GLUVO_DOBA_ROLES[r.roleId].name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryPanel({ my }: { my: GluvoDobaControllerData }) {
  const seer = my.seerHistory;
  const zduhac = my.zduhacHistory;
  if ((!seer || seer.length === 0) && (!zduhac || zduhac.length === 0)) {
    return null;
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        width: '100%',
        maxHeight: '30vh',
        overflowY: 'auto',
      }}
    >
      {seer?.map((e, i) => (
        <div
          key={`s${i}`}
          style={{
            background: 'var(--bg-card)',
            borderRadius: '10px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.85rem',
            textAlign: 'left',
          }}
        >
          🔮 Noć {e.night} — {e.targetName}: {e.hintText}
        </div>
      ))}
      {zduhac?.map((e, i) => (
        <div
          key={`z${i}`}
          style={{
            background: 'var(--bg-card)',
            borderRadius: '10px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.85rem',
            textAlign: 'left',
          }}
        >
          👁️ Noć {e.night} — {e.targetName}: DA {e.da} / NE {e.ne}
        </div>
      ))}
    </div>
  );
}

export default function GluvoDobaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const isRemoteHost = usePlayerStore(
    (s) => s.room?.remoteHostPlayerId != null && s.room.remoteHostPlayerId === s.player?.id
  );

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as GluvoDobaHostData;
  const my = (playerData[playerId] ?? { alive: false }) as unknown as
    GluvoDobaControllerData;
  const roleDef = my.roleId ? GLUVO_DOBA_ROLES[my.roleId] : null;

  // Joined mid-game — no seat at this table.
  if (!roleDef) {
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1.1rem' }}>
          Partija je u toku — posmatraj i uskači u sledeću!
        </p>
      </div>
    );
  }

  const isWolf = my.roleId === 'vukodlak';
  const teamColor = isWolf ? 'var(--danger)' : 'var(--accent)';

  // --- podela-uloga -------------------------------------------------------
  if (phase === 'podela-uloga') {
    return (
      <div style={wrap}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Tvoja tajna uloga
        </p>
        <p style={{ fontSize: '3rem', margin: 0 }}>{ROLE_EMOJI[my.roleId!]}</p>
        <p style={{ fontSize: '1.8rem', fontWeight: 800, color: teamColor, margin: 0 }}>
          {roleDef.name}
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          {roleDef.description}
        </p>
        {isWolf && my.packMates && my.packMates.length > 0 && (
          <p style={{ fontSize: '0.95rem' }}>
            Tvoj čopor:{' '}
            <strong style={{ color: 'var(--danger)' }}>
              {my.packMates.map((m) => m.name).join(', ')}
            </strong>
          </p>
        )}
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Nikome ne pokazuj ekran! 🤫
        </p>
      </div>
    );
  }

  // --- noc ----------------------------------------------------------------
  if (phase === 'noc') {
    if (!my.alive) {
      return <GhostView my={my} timeRemaining={timeRemaining} isNight />;
    }
    if (my.canAct && !my.hasActed && my.targets) {
      return (
        <TargetGrid
          prompt={roleDef.nightPrompt}
          targets={my.targets}
          onPick={(targetId) => emit('gluvo:night-action', { targetId })}
          timeRemaining={timeRemaining}
        />
      );
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2rem', margin: 0 }}>🌙</p>
        <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>Selo spava…</p>
        {isWolf && my.packPicks && my.packPicks.length > 0 && (
          <div style={{ fontSize: '0.9rem' }}>
            {my.packPicks.map((p, i) => (
              <p key={i} style={{ margin: '0.2rem 0', color: 'var(--danger)' }}>
                🐺 {p.name} → {p.targetName}
              </p>
            ))}
          </div>
        )}
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {host.actedCount}/{host.totalActors} · {timeRemaining}s
        </p>
        <HistoryPanel my={my} />
      </div>
    );
  }

  // --- osveta ---------------------------------------------------------------
  if (phase === 'osveta') {
    if (my.isAvenger && my.osvetaTargets) {
      return (
        <TargetGrid
          prompt="🧵 Tvoja nit je presečena! Koga vodiš sa sobom?"
          targets={my.osvetaTargets}
          onPick={(targetId) => emit('gluvo:osveta', { targetId })}
          timeRemaining={timeRemaining}
        />
      );
    }
    return (
      <div style={wrap}>
        {host.osvetaPublic ? (
          <>
            <p style={{ fontSize: '2rem', margin: 0 }}>🧵</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              Suđaja se sveti!
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: '2rem', margin: 0 }}>🌙</p>
            <p style={{ fontSize: '1.1rem' }}>Noć se produžava…</p>
          </>
        )}
      </div>
    );
  }

  // --- zora -----------------------------------------------------------------
  if (phase === 'zora') {
    if (!my.alive) {
      return <GhostView my={my} timeRemaining={timeRemaining} isNight={false} />;
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2rem', margin: 0 }}>🌅</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Zora je</p>
        {host.deaths && host.deaths.length > 0 ? (
          host.deaths.map((d) => (
            <p key={d.playerId} style={{ margin: 0, fontSize: '1rem' }}>
              💀 <strong>{d.name}</strong> <CauseLabel cause={d.cause} />
            </p>
          ))
        ) : (
          <p style={{ margin: 0 }}>Niko nije stradao ove noći.</p>
        )}
        {host.whisperTop && host.whisperTop.length > 0 && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Šapat sumnje:{' '}
            {host.whisperTop.map((w) => `${w.name} (${w.count})`).join(' · ')}
          </p>
        )}
        <HistoryPanel my={my} />
      </div>
    );
  }

  // --- diskusija --------------------------------------------------------------
  if (phase === 'diskusija') {
    if (!my.alive) {
      return <GhostView my={my} timeRemaining={timeRemaining} isNight={false} />;
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2rem', margin: 0 }}>🗣️</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Raspravljajte!</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}>
          {timeRemaining}s
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Ko se noćas čudno ponašao? Pričajte uživo — glasanje stiže.
        </p>
        <HistoryPanel my={my} />
        {isRemoteHost && (
          <button
            onClick={() => socket.emit('host:game-action', { action: 'gluvo:skip-discussion' })}
            style={{
              padding: '0.7rem 1.4rem',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 700,
            }}
          >
            Pređi na glasanje ▶
          </button>
        )}
      </div>
    );
  }

  // --- glasanje ---------------------------------------------------------------
  if (phase === 'glasanje') {
    if (!my.alive) {
      return <GhostView my={my} timeRemaining={timeRemaining} isNight={false} />;
    }
    if (my.hasVoted) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.1rem' }}>Glas je zabeležen ✅</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.votedCount}/{host.totalVoters} glasalo · {timeRemaining}s
          </p>
        </div>
      );
    }
    return (
      <TargetGrid
        prompt="⚖️ Ko ide na vešala?"
        targets={my.voteOptions ?? []}
        onPick={(targetId) => emit('gluvo:vote', { targetId })}
        extraOption={{ id: 'skip', label: 'Preskoči — niko danas' }}
        timeRemaining={timeRemaining}
      />
    );
  }

  // --- presuda ----------------------------------------------------------------
  if (phase === 'presuda') {
    return (
      <div style={{ ...wrap, overflowY: 'auto' }}>
        <p style={{ fontSize: '2rem', margin: 0 }}>⚖️</p>
        {host.lynched ? (
          <p style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
            Selo je obesilo <span style={{ color: 'var(--danger)' }}>{host.lynched.name}</span>
          </p>
        ) : (
          <p style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
            Selo nije odlučilo — niko nije obešen.
          </p>
        )}
        {host.osvetaVictim && (
          <p style={{ margin: 0 }}>
            🧵 Suđaja je povukla nit — <strong>{host.osvetaVictim.name}</strong> odlazi sa njom!
          </p>
        )}
        {host.voteTally && host.voteTally.length > 0 && (
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.voteTally.map((t) => (
              <p key={t.playerId} style={{ margin: '0.15rem 0' }}>
                {t.name}: {t.votes}
              </p>
            ))}
            {(host.skipVotes ?? 0) > 0 && <p style={{ margin: '0.15rem 0' }}>Preskok: {host.skipVotes}</p>}
          </div>
        )}
      </div>
    );
  }

  // --- kraj / ended -------------------------------------------------------------
  if (phase === 'kraj' || phase === 'ended') {
    const iWon = roleDef.team === host.winner;
    return (
      <div style={{ ...wrap, justifyContent: 'flex-start', overflowY: 'auto' }}>
        <p style={{ fontSize: '2.4rem', margin: 0 }}>
          {host.winner === 'vukodlaci' ? '🐺' : '🌾'}
        </p>
        <p style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
          {host.winner === 'vukodlaci' ? 'Vukodlaci su pobedili!' : 'Selo je pobedilo!'}
        </p>
        <p
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: iWon ? 'var(--success)' : 'var(--danger)',
            margin: 0,
          }}
        >
          {iWon ? 'Tvoj tim slavi 🎉' : 'Tvoj tim je pao…'}
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            width: '100%',
          }}
        >
          {host.finalRoles?.map((r) => (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                background: 'var(--bg-card)',
                borderRadius: '10px',
                fontSize: '0.95rem',
                opacity: r.alive ? 1 : 0.6,
              }}
            >
              <span>
                {r.avatarEmoji} {r.name} {!r.alive && '💀'}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color:
                    GLUVO_DOBA_ROLES[r.roleId].team === 'vukodlaci'
                      ? 'var(--danger)'
                      : 'var(--text-secondary)',
                }}
              >
                {ROLE_EMOJI[r.roleId]} {GLUVO_DOBA_ROLES[r.roleId].name}
              </span>
            </div>
          ))}
        </div>
        {isRemoteHost && phase === 'kraj' && (
          <button
            onClick={() => socket.emit('host:game-action', { action: 'gluvo:end-now' })}
            style={{
              padding: '0.7rem 1.4rem',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 700,
            }}
          >
            Nazad u sobu ▶
          </button>
        )}
      </div>
    );
  }

  return null;
}
