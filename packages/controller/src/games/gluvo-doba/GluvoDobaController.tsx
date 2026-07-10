import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import type {
  GluvoDobaControllerData,
  GluvoDobaHostData,
  GluvoDobaPhase,
  GluvoDobaRoleId,
  GluvoDobaTargetOption,
  GluvoDobaTeam,
} from '@igra/shared';
import {
  GLUVO_DOBA_ROLES,
  GLUVO_DOBA_TEAM_NAMES,
  GLUVO_CHEAT_FLOW,
  gluvoTutorialControllerHint,
} from '@igra/shared';

function emit(action: string, data: Record<string, unknown> = {}) {
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

export const ROLE_EMOJI: Record<GluvoDobaRoleId, string> = {
  vukodlak: '🐺',
  vampir: '🧛',
  todorac: '🐎',
  drekavac: '😱',
  bauk: '👹',
  zmaj: '🐉',
  vidovnjak: '🔮',
  zduhac: '🌪️',
  sudjaja: '🧵',
  knez: '👑',
  raskovnik: '🌿',
  bajacica: '🕯️',
  vila: '🧚',
  domacin: '🌾',
  lesnik: '🌲',
  morana: '❄️',
};

function teamColor(team: GluvoDobaTeam): string {
  if (team === 'vukodlaci') return 'var(--danger)';
  if (team === 'neutralci') return '#c29b47';
  return 'var(--accent)';
}

function CauseLabel({ cause }: { cause: string }) {
  const text =
    cause === 'wolves'
      ? 'rastrgnut u gluvo doba'
      : cause === 'morana'
        ? 'zaleđen Moraninom rukom'
        : cause === 'osveta'
          ? 'povučen niti sudbine'
          : cause === 'lynch'
            ? 'obešen na trgu'
            : 'nestao bez traga';
  return <span style={{ color: 'var(--text-secondary)' }}>({text})</span>;
}

function DeathReveal({
  roleId,
  team,
}: {
  roleId?: GluvoDobaRoleId;
  team?: GluvoDobaTeam;
}) {
  if (roleId) {
    return (
      <span style={{ color: teamColor(GLUVO_DOBA_ROLES[roleId].team) }}>
        {' '}
        — {ROLE_EMOJI[roleId]} {GLUVO_DOBA_ROLES[roleId].name}
      </span>
    );
  }
  if (team) {
    return (
      <span style={{ color: teamColor(team) }}>
        {' '}
        — {GLUVO_DOBA_TEAM_NAMES[team]}
      </span>
    );
  }
  return null;
}

/**
 * Floating "?" button + modal: game-flow cheat lines + this match's active
 * roles (open setup knowledge via hostData.rolesInPlay). TUTORIAL-ONLY —
 * a normal game keeps a clean screen; players learn the roles beforehand
 * or on the /gluvo-doba rules page.
 */
function RolesInPlayButton({ host }: { host: GluvoDobaHostData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Aktivne uloge"
        style={{
          position: 'fixed',
          top: '0.75rem',
          right: '0.75rem',
          zIndex: 40,
          width: '2.4rem',
          height: '2.4rem',
          borderRadius: '50%',
          border: 'none',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontWeight: 800,
          fontSize: '1.1rem',
        }}
      >
        ?
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '1rem',
              maxHeight: '80vh',
              overflowY: 'auto',
              width: '100%',
              maxWidth: '420px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <p style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem', textAlign: 'center' }}>
              🎓 Tok igre
            </p>
            <div
              style={{
                background: 'var(--bg-card)',
                borderRadius: '10px',
                padding: '0.6rem 0.75rem',
                borderLeft: '4px solid #c29b47',
              }}
            >
              {GLUVO_CHEAT_FLOW.map((line, i) => (
                <p
                  key={i}
                  style={{
                    margin: i === 0 ? 0 : '0.35rem 0 0',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem', textAlign: 'center' }}>
              Uloge u ovoj partiji
            </p>
            {host.rolesInPlay?.map(({ roleId, count }) => {
              const def = GLUVO_DOBA_ROLES[roleId];
              return (
                <div
                  key={roleId}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: '10px',
                    padding: '0.6rem 0.75rem',
                    borderLeft: `4px solid ${teamColor(def.team)}`,
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 800 }}>
                    {ROLE_EMOJI[roleId]} {def.name}
                    {count > 1 && ` ×${count}`}{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        color: teamColor(def.team),
                      }}
                    >
                      {GLUVO_DOBA_TEAM_NAMES[def.team]}
                    </span>
                  </p>
                  <p
                    style={{
                      margin: '0.25rem 0 0',
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {def.description}
                  </p>
                </div>
              );
            })}
            <a
              href="/gluvo-doba"
              target="_blank"
              rel="noreferrer"
              style={{
                textAlign: 'center',
                fontSize: '0.85rem',
                color: 'var(--accent)',
                textDecoration: 'underline',
              }}
            >
              Puna pravila igre ↗
            </a>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: '0.6rem',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontWeight: 700,
              }}
            >
              Zatvori
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function TargetGrid({
  roleLine,
  prompt,
  note,
  targets,
  onPick,
  extraOption,
  timeRemaining,
  hideTimer,
}: {
  roleLine?: string;
  prompt: string;
  note?: string;
  targets: GluvoDobaTargetOption[];
  onPick: (targetId: string) => void;
  extraOption?: { id: string; label: string };
  timeRemaining: number;
  /** Tutorial mod: tajmer stoji na serveru pa se ne prikazuje. */
  hideTimer?: boolean;
}) {
  // One shared layout for every night role — from across the room every
  // phone looks identical, only the small text differs.
  return (
    <div style={column}>
      {roleLine && (
        <p
          style={{
            fontSize: '0.9rem',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0,
            color: 'var(--text-secondary)',
          }}
        >
          {roleLine}
        </p>
      )}
      <p style={{ fontSize: '1.2rem', fontWeight: 800, textAlign: 'center', margin: 0 }}>
        {prompt}
      </p>
      {note && (
        <p
          style={{
            fontSize: '0.8rem',
            textAlign: 'center',
            margin: 0,
            color: 'var(--text-secondary)',
          }}
        >
          {note}
        </p>
      )}
      {!hideTimer && (
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
      )}
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
  tutorial,
}: {
  my: GluvoDobaControllerData;
  tutorial?: boolean;
}) {
  return (
    <div style={{ ...column, overflowY: 'auto' }}>
      <p style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', margin: 0 }}>
        👻 Mrtav si — ali vidiš sve
      </p>
      {my.ghostQuestion && (
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '12px',
            padding: '0.85rem',
            textAlign: 'center',
            border: '2px solid #c29b47',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            🕯️ Bajačica pita mrtve: da li je{' '}
            <strong>{my.ghostQuestion.targetName}</strong> vukodlak?
          </p>
          {my.hasGhostVoted ? (
            <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)' }}>
              Odgovorio si mrtvima.
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
          {tutorial && (
            <p
              style={{
                margin: '0.5rem 0 0',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
              }}
            >
              Mrtvi vukodlaci smeju da lažu…
            </p>
          )}
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
                color: teamColor(GLUVO_DOBA_ROLES[r.roleId].team),
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
  const seer = my.seerHistory ?? [];
  const bajanja = my.bajacicaHistory ?? [];
  if (seer.length === 0 && bajanja.length === 0) return null;
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
      {seer.map((e, i) => (
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
      {bajanja.map((e, i) => (
        <div
          key={`b${i}`}
          style={{
            background: 'var(--bg-card)',
            borderRadius: '10px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.85rem',
            textAlign: 'left',
          }}
        >
          🕯️ Noć {e.night} — {e.targetName}:{' '}
          {e.blocked
            ? 'mrtvi su ćutali (pregažena si)'
            : e.da + e.ne === 0
              ? 'mrtvi još ćute — nema duhova'
              : `DA ${e.da} / NE ${e.ne}`}
        </div>
      ))}
    </div>
  );
}

/**
 * The dark pack's private roster — every member's name AND exact role, so a
 * Vukodlak always knows who his Vampir / Todorac / etc. are. Dark-team only;
 * flows through the private playerData slice, never the shared hostData.
 */
function PackRoster({
  packMates,
  compact,
}: {
  packMates: NonNullable<GluvoDobaControllerData['packMates']>;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '340px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: compact ? '0.8rem' : '0.9rem',
          fontWeight: 800,
          color: 'var(--danger)',
        }}
      >
        🐺 Tvoje Sile Mraka
      </p>
      {packMates.map((m) => (
        <div
          key={m.playerId}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.45rem 0.7rem',
            background: 'var(--bg-card)',
            borderRadius: '10px',
            borderLeft: '4px solid var(--danger)',
            fontSize: compact ? '0.85rem' : '0.95rem',
          }}
        >
          <span style={{ fontWeight: 700 }}>{m.name}</span>
          <span style={{ fontWeight: 700, color: 'var(--danger)' }}>
            {ROLE_EMOJI[m.roleId]} {GLUVO_DOBA_ROLES[m.roleId].name}
          </span>
        </div>
      ))}
    </div>
  );
}

function BlockedBanner() {
  return (
    <p
      style={{
        margin: 0,
        fontSize: '0.9rem',
        fontWeight: 700,
        color: 'var(--danger)',
      }}
    >
      🐎 Todorac te je noćas pregazio — tvoja moć nije delovala!
    </p>
  );
}

function KnezRevealButton() {
  const [arming, setArming] = useState(false);
  if (!arming) {
    return (
      <button
        onClick={() => setArming(true)}
        style={{
          padding: '0.7rem 1.4rem',
          borderRadius: '10px',
          border: '2px solid #c29b47',
          background: 'transparent',
          color: '#c29b47',
          fontWeight: 800,
        }}
      >
        👑 Otkrij se kao Knez
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button
        onClick={() => emit('gluvo:knez-reveal')}
        style={{
          padding: '0.7rem 1.2rem',
          borderRadius: '10px',
          border: 'none',
          background: '#c29b47',
          color: '#1d3557',
          fontWeight: 800,
        }}
      >
        👑 Da, otkrij me — glas ×2
      </button>
      <button
        onClick={() => setArming(false)}
        style={{
          padding: '0.7rem 1rem',
          borderRadius: '10px',
          border: 'none',
          background: 'var(--bg-card)',
          color: 'var(--text-secondary)',
          fontWeight: 700,
        }}
      >
        Odustani
      </button>
    </div>
  );
}

export default function GluvoDobaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const isRemoteHost = usePlayerStore(
    (s) =>
      s.room?.remoteHostPlayerId != null &&
      s.room.remoteHostPlayerId === s.player?.id
  );

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as GluvoDobaHostData;
  const tutorial = data.tutorialMode === true;
  const my = (playerData[playerId] ?? { alive: false }) as unknown as
    GluvoDobaControllerData;
  const roleDef = my.roleId ? GLUVO_DOBA_ROLES[my.roleId] : null;

  // Joined mid-game — no seat at this table.
  if (!roleDef) {
    return (
      <div style={wrap}>
        {tutorial && <RolesInPlayButton host={host} />}
        <p style={{ fontSize: '1.1rem' }}>
          Partija je u toku — posmatraj i uskači u sledeću!
        </p>
      </div>
    );
  }

  const isDark = roleDef.team === 'vukodlaci';
  const myColor = teamColor(roleDef.team);
  const roleLine = `${ROLE_EMOJI[my.roleId!]} Ti si ${roleDef.name}`;

  const screen = (() => {
    // --- podela-uloga -----------------------------------------------------
    if (phase === 'podela-uloga') {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Tvoja tajna uloga
          </p>
          <p style={{ fontSize: '3rem', margin: 0 }}>{ROLE_EMOJI[my.roleId!]}</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 800, color: myColor, margin: 0 }}>
            {roleDef.name}
          </p>
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: myColor, margin: 0 }}>
            {GLUVO_DOBA_TEAM_NAMES[roleDef.team]}
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            {roleDef.description}
          </p>
          {isDark && my.packMates && my.packMates.length > 0 && (
            <PackRoster packMates={my.packMates} />
          )}
          {isDark && my.packMates && my.packMates.length === 0 && (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Sam si u Silama Mraka — nema saborca.
            </p>
          )}
          {tutorial && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Nikome ne pokazuj ekran! 🤫
            </p>
          )}
        </div>
      );
    }

    // --- noc ----------------------------------------------------------------
    if (phase === 'noc') {
      if (!my.alive) return <GhostView my={my} tutorial={tutorial} />;
      if (my.canAct && !my.hasActed && my.targets) {
        const isMoranaOffNight =
          my.roleId === 'morana' && !my.moranaKillTonight;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {isDark && my.packMates && my.packMates.length > 0 && (
              <div style={{ padding: '0.75rem 1rem 0', display: 'flex', justifyContent: 'center' }}>
                <PackRoster packMates={my.packMates} compact />
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
              <TargetGrid
                roleLine={roleLine}
                prompt={isMoranaOffNight ? 'Koga sumnjičiš?' : roleDef.nightPrompt}
                note={
                  my.peacefulNight
                    ? '🌘 Prva noć — upoznaj čopor, večeras nema krvi. Tvoj izbor se ne računa.'
                    : isMoranaOffNight
                      ? 'Noćas ne lediš — skupljaš snagu za sledeću noć.'
                      : my.roleId === 'vampir'
                        ? my.vampirLeader
                          ? '🧛 Kum je pao — sada ti biraš žrtvu čopora!'
                          : 'Kum (Vukodlak) bira žrtvu — tvoj glas vredi tek ako kuma nestane.'
                        : my.roleId === 'zduhac' && my.zduhacSaveAvailable
                          ? 'Tvoja duša i dalje čuva selo (štit nepotrošen).'
                          : undefined
                }
                targets={my.targets}
                onPick={(targetId) => emit('gluvo:night-action', { targetId })}
                timeRemaining={timeRemaining}
                hideTimer={tutorial}
              />
            </div>
          </div>
        );
      }
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2rem', margin: 0 }}>🌙</p>
          <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>Selo spava…</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            {roleLine}
          </p>
          {isDark && my.packMates && my.packMates.length > 0 && (
            <PackRoster packMates={my.packMates} compact />
          )}
          {isDark && my.packPicks && my.packPicks.length > 0 && (
            <div style={{ fontSize: '0.9rem' }}>
              {my.packPicks.map((p, i) => (
                <p key={i} style={{ margin: '0.2rem 0', color: 'var(--danger)' }}>
                  🐺 {p.name} → {p.targetName}
                </p>
              ))}
            </div>
          )}
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {host.actedCount}/{host.totalActors}
            {!tutorial && ` · ${timeRemaining}s`}
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
            hideTimer={tutorial}
          />
        );
      }
      return (
        <div style={wrap}>
          {host.osvetaPublic ? (
            <>
              <p style={{ fontSize: '2rem', margin: 0 }}>🧵</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Suđaja se sveti!</p>
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
      if (!my.alive) return <GhostView my={my} tutorial={tutorial} />;
      return (
        <div style={{ ...wrap, overflowY: 'auto' }}>
          <p style={{ fontSize: '2rem', margin: 0 }}>🌅</p>
          <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Zora je</p>
          {my.blockedLastNight && <BlockedBanner />}
          {host.peacefulFirstNight && (
            <p style={{ margin: 0 }}>🕊️ Prva noć je prošla mirno — bez krvi.</p>
          )}
          {host.zduhacSaved && (
            <p style={{ margin: 0, fontWeight: 700, color: '#c29b47' }}>
              🌪️ Zduhać ({host.zduhacSaved.name}) je presreo napad u oblacima!
            </p>
          )}
          {host.deaths && host.deaths.length > 0 ? (
            host.deaths.map((d) => (
              <p key={d.playerId} style={{ margin: 0, fontSize: '1rem' }}>
                💀 <strong>{d.name}</strong> <CauseLabel cause={d.cause} />
                <DeathReveal roleId={d.roleId} team={d.team} />
              </p>
            ))
          ) : (
            !host.peacefulFirstNight && (
              <p style={{ margin: 0 }}>Niko nije stradao ove noći.</p>
            )
          )}
          {host.mutedToday && (
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              👹 <strong>{host.mutedToday.name}</strong> je preplašen — danas ne glasa.
            </p>
          )}
          {host.whisperTop && host.whisperTop.length > 0 && (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Šapat sumnje:{' '}
              {host.whisperTop.map((w) => `${w.name} (${w.count})`).join(' · ')}
            </p>
          )}
          {my.canKnezReveal && <KnezRevealButton />}
          <HistoryPanel my={my} />
        </div>
      );
    }

    // --- diskusija --------------------------------------------------------------
    if (phase === 'diskusija') {
      if (!my.alive) return <GhostView my={my} tutorial={tutorial} />;
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2rem', margin: 0 }}>🗣️</p>
          <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Raspravljajte!</p>
          {!tutorial && (
            <p style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}>
              {timeRemaining}s
            </p>
          )}
          {my.blockedLastNight && <BlockedBanner />}
          {host.knezRevealed && (
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#c29b47' }}>
              👑 Knez sela: <strong>{host.knezRevealed.name}</strong> (glas ×2)
            </p>
          )}
          {tutorial && (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Ko se noćas čudno ponašao? Pričajte uživo — glasanje stiže.
            </p>
          )}
          {my.canKnezReveal && <KnezRevealButton />}
          <HistoryPanel my={my} />
          {/* U tutorialu globalno "Sledeća faza" dugme pokriva prelaz. */}
          {isRemoteHost && !tutorial && (
            <button
              onClick={() =>
                socket.emit('host:game-action', { action: 'gluvo:skip-discussion' })
              }
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
      if (!my.alive) return <GhostView my={my} tutorial={tutorial} />;
      if (my.muted) {
        return (
          <div style={wrap}>
            <p style={{ fontSize: '2.4rem', margin: 0 }}>👹</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              Bauk te je uplašio!
            </p>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Od straha danas ne smeš da glasaš. Možeš da pričaš — ali tvoj
              glas se ne broji.
            </p>
          </div>
        );
      }
      if (my.hasVoted) {
        return (
          <div style={wrap}>
            <p style={{ fontSize: '1.1rem' }}>Glas je zabeležen ✅</p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {host.votedCount}/{host.totalVoters} glasalo
              {!tutorial && ` · ${timeRemaining}s`}
            </p>
          </div>
        );
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <TargetGrid
              prompt="⚖️ Ko ide na vešala?"
              note={
                host.knezRevealed
                  ? `👑 Knez ${host.knezRevealed.name} glasa duplo`
                  : undefined
              }
              targets={my.voteOptions ?? []}
              onPick={(targetId) => emit('gluvo:vote', { targetId })}
              extraOption={{ id: 'skip', label: 'Preskoči — niko danas' }}
              timeRemaining={timeRemaining}
              hideTimer={tutorial}
            />
          </div>
          {my.canKnezReveal && (
            <div style={{ padding: '0.5rem', display: 'flex', justifyContent: 'center' }}>
              <KnezRevealButton />
            </div>
          )}
        </div>
      );
    }

    // --- presuda ----------------------------------------------------------------
    if (phase === 'presuda') {
      return (
        <div style={{ ...wrap, overflowY: 'auto' }}>
          <p style={{ fontSize: '2rem', margin: 0 }}>⚖️</p>
          {host.lynched ? (
            <p style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
              Selo je obesilo{' '}
              <span style={{ color: 'var(--danger)' }}>{host.lynched.name}</span>
              <DeathReveal roleId={host.lynched.roleId} team={host.lynched.team} />
            </p>
          ) : (
            <p style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              Selo nije odlučilo — niko nije obešen.
            </p>
          )}
          {host.osvetaVictim && (
            <p style={{ margin: 0 }}>
              🧵 Suđaja je povukla nit — <strong>{host.osvetaVictim.name}</strong>{' '}
              odlazi sa njom!
              <DeathReveal
                roleId={host.osvetaVictim.roleId}
                team={host.osvetaVictim.team}
              />
            </p>
          )}
          {host.voteTally && host.voteTally.length > 0 && (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {host.voteTally.map((t) => (
                <p key={t.playerId} style={{ margin: '0.15rem 0' }}>
                  {t.name}: {t.votes}
                </p>
              ))}
              {(host.skipVotes ?? 0) > 0 && (
                <p style={{ margin: '0.15rem 0' }}>Preskok: {host.skipVotes}</p>
              )}
            </div>
          )}
        </div>
      );
    }

    // --- kraj / ended -------------------------------------------------------------
    if (phase === 'kraj' || phase === 'ended') {
      const iWon =
        (host.moranaWon && my.roleId === 'morana') ||
        (!host.moranaWon && roleDef.team === host.winner) ||
        (my.roleId === 'lesnik' && my.alive);
      const winnerText = host.moranaWon
        ? '❄️ Morana je uzela selo!'
        : host.winner === 'vukodlaci'
          ? '🐺 Sile Mraka su pobedile!'
          : '🌾 Selo je pobedilo!';
      return (
        <div style={{ ...wrap, justifyContent: 'flex-start', overflowY: 'auto' }}>
          <p style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            {winnerText}
          </p>
          {host.lesnikSurvived && (
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#c29b47' }}>
              🌲 Lesnik ({host.lesnikSurvived.name}) je preživeo — pobeđuje uz
              pobednike!
            </p>
          )}
          <p
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: iWon ? 'var(--success)' : 'var(--danger)',
              margin: 0,
            }}
          >
            {iWon ? 'Slaviš pobedu 🎉' : 'Tvoja strana je pala…'}
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
                    color: teamColor(GLUVO_DOBA_ROLES[r.roleId].team),
                  }}
                >
                  {ROLE_EMOJI[r.roleId]} {GLUVO_DOBA_ROLES[r.roleId].name}
                </span>
              </div>
            ))}
          </div>
          {/* U tutorialu globalno "Sledeća faza" dugme završava igru. */}
          {isRemoteHost && phase === 'kraj' && !tutorial && (
            <button
              onClick={() =>
                socket.emit('host:game-action', { action: 'gluvo:end-now' })
              }
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
  })();

  const tutorialHint = tutorial
    ? gluvoTutorialControllerHint(phase as GluvoDobaPhase, {
        alive: my.alive,
        canAct: my.canAct === true,
        hasActed: my.hasActed === true,
        muted: my.muted === true,
        isGhost: !my.alive,
        isAvenger: my.isAvenger === true,
        osvetaPublic: host.osvetaPublic === true,
      })
    : null;

  return (
    <>
      {tutorial && <RolesInPlayButton host={host} />}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {tutorialHint && (
          <p
            key={`${phase}-${my.hasActed}-${my.canAct}`}
            style={{
              margin: '0.6rem 0.75rem 0',
              fontSize: '0.75rem',
              color: 'var(--text-primary)',
              background: 'rgba(194,155,71,0.1)',
              border: '1px solid rgba(194,155,71,0.35)',
              borderRadius: '0.6rem',
              padding: '0.45rem 0.6rem',
              // "?" dugme je u gornjem desnom uglu — hint mu ne sme pod prste.
              marginRight: '3.4rem',
              lineHeight: 1.4,
              animation: 'igra-pop .3s',
            }}
          >
            🎓 {tutorialHint}
          </p>
        )}
        {tutorial && isRemoteHost && phase !== 'ended' && (
          <button
            onClick={() =>
              socket.emit('host:game-action', { action: 'gluvo:next-phase' })
            }
            style={{
              margin: '0.4rem 0.75rem 0',
              padding: '0.5rem 1rem',
              borderRadius: '0.6rem',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            🎓{' '}
            {GLUVO_INPUT_PHASES.has(phase)
              ? 'Preskoči — nastavi ▸'
              : 'Sledeća faza ▸'}
          </button>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>{screen}</div>
      </div>
    </>
  );
}

// Faze u kojima igrači unose odluke — "sledeća faza" tu prinudno razrešava
// fazu sa dosad pristiglim akcijama, pa dugme menja tekst.
const GLUVO_INPUT_PHASES = new Set(['noc', 'osveta', 'glasanje']);
