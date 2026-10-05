import { useState, type ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { GameFrame } from '../../components/kit/GameFrame';
import type {
  GluvoDobaControllerData,
  GluvoDobaDeath,
  GluvoDobaHostData,
  GluvoDobaPhase,
  GluvoDobaPlayerInfo,
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

/** Team colours: Mrak rust, Selo gold, Neutral periwinkle (never gold — it read as Selo). */
const TEAM = {
  vukodlaci: { solid: '#e06a5e', text: '#f09a8f', tint: 'rgba(224,106,94,' },
  selo: { solid: '#c29b47', text: '#e3b45e', tint: 'rgba(194,155,71,' },
  neutralci: { solid: '#8fa3d9', text: '#aebde6', tint: 'rgba(143,163,217,' },
} as const;

function teamText(team: GluvoDobaTeam): string {
  return TEAM[team].text;
}

/** Full-phone backdrops: the night is deep and cool, dawn is the first bright sky. */
const BG = {
  night:
    'radial-gradient(600px 400px at 80% -5%, rgba(143,163,217,.22), transparent 60%), #0b1628',
  dawn: 'radial-gradient(700px 420px at 50% -4%, rgba(227,180,94,.38), transparent 65%), #22304f',
  ghost: 'radial-gradient(500px 400px at 50% 0%, rgba(245,235,224,.08), transparent 70%), #1b2233',
  selo: 'radial-gradient(700px 460px at 50% 0%, rgba(227,180,94,.4), transparent 65%), #2d4a2b',
  mrak: 'radial-gradient(700px 460px at 50% 0%, rgba(224,106,94,.4), transparent 65%), #4a1c1a',
  morana: 'radial-gradient(700px 460px at 50% 0%, rgba(190,225,250,.38), transparent 65%), #1c3a52',
};

const center: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  gap: 8,
  textAlign: 'center',
};

const eyebrow: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
};

const softRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 46,
  padding: '0 12px',
  borderRadius: 12,
  background: 'rgba(245,235,224,.05)',
};

function Avatar({
  emoji,
  color,
  size = 38,
  dead,
}: {
  emoji?: string;
  color?: string;
  size?: number;
  dead?: boolean;
}) {
  return (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '30%',
        background: color ?? 'var(--bg-card)',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.52,
        flexShrink: 0,
        filter: dead ? 'grayscale(.7)' : undefined,
      }}
    >
      {emoji}
      {dead && (
        <span style={{ position: 'absolute', right: -6, bottom: -6, fontSize: size * 0.42 }}>💀</span>
      )}
    </span>
  );
}

function causeText(cause: string): string {
  return cause === 'wolves'
    ? 'rastrgnut u gluvo doba'
    : cause === 'morana'
      ? 'zaleđen Moraninom rukom'
      : cause === 'osveta'
        ? 'povučen niti sudbine'
        : cause === 'lynch'
          ? 'obešen na trgu'
          : 'nestao bez traga';
}

/** What the village learned about a dead player: exact role, only the team, or nothing. */
function RevealChip({ roleId, team }: { roleId?: GluvoDobaRoleId; team?: GluvoDobaTeam }) {
  if (!roleId && !team) return null;
  const t = roleId ? GLUVO_DOBA_ROLES[roleId].team : team!;
  return (
    <span
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 999,
        background: TEAM[t].tint + '.18)',
        color: teamText(t),
        fontSize: '0.8rem',
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {roleId ? `${ROLE_EMOJI[roleId]} ${GLUVO_DOBA_ROLES[roleId].name}` : GLUVO_DOBA_TEAM_NAMES[team!]}
    </span>
  );
}

/**
 * "?" + modal: game-flow cheat lines + this match's active roles (open setup
 * knowledge via hostData.rolesInPlay). TUTORIAL-ONLY — a normal game keeps a
 * clean screen; players learn the roles beforehand or on /gluvo-doba.
 */
function RolesInPlayButton({ host }: { host: GluvoDobaHostData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Aktivne uloge"
        style={{
          width: 40,
          height: 40,
          minWidth: 40,
          minHeight: 40,
          padding: 0,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontWeight: 800,
          fontSize: '1.05rem',
          flexShrink: 0,
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
            zIndex: 1000,
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
              borderRadius: 20,
              padding: '1rem',
              maxHeight: '80vh',
              overflowY: 'auto',
              width: '100%',
              maxWidth: 420,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <p className="display" style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', textAlign: 'center' }}>
              🎓 Tok igre
            </p>
            <div
              style={{
                background: 'var(--bg-card)',
                borderRadius: 12,
                padding: '0.6rem 0.75rem',
                borderLeft: '4px solid var(--accent)',
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
            <p className="display" style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', textAlign: 'center' }}>
              Uloge u ovoj partiji
            </p>
            {host.rolesInPlay?.map(({ roleId, count }) => {
              const def = GLUVO_DOBA_ROLES[roleId];
              return (
                <div
                  key={roleId}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: 12,
                    padding: '0.6rem 0.75rem',
                    borderLeft: `4px solid ${TEAM[def.team].solid}`,
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 800 }}>
                    {ROLE_EMOJI[roleId]} {def.name}
                    {count > 1 && ` ×${count}`}{' '}
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: teamText(def.team) }}>
                      {GLUVO_DOBA_TEAM_NAMES[def.team]}
                    </span>
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {def.description}
                  </p>
                </div>
              );
            })}
            <a
              href="/gluvo-doba"
              target="_blank"
              rel="noreferrer"
              style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--amber)' }}
            >
              Puna pravila igre ↗
            </a>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Zatvori
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One shared layout for every role at night (and for votes) — from across
 * the room every phone looks identical, only the small text differs. Dark
 * phones additionally see who in the pack picked whom, from playerData.
 */
function TargetList({
  roleLine,
  prompt,
  note,
  aside,
  targets,
  onPick,
  extraOption,
  packTags,
  pickColor = '#e06a5e',
}: {
  roleLine?: string;
  prompt: string;
  note?: string;
  aside?: ReactNode;
  targets: GluvoDobaTargetOption[];
  onPick: (targetId: string) => void;
  extraOption?: { id: string; label: string };
  packTags?: Map<string, string[]>;
  pickColor?: string;
}) {
  // The tapped row fills, the rest fade — until the server's "recorded" lands.
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (id: string) => {
    if (picked) return;
    setPicked(id);
    onPick(id);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {roleLine && (
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{roleLine}</span>
      )}
      <span className="display" style={{ marginTop: 4, fontWeight: 700, fontSize: '1.8rem', lineHeight: 1.05 }}>
        {prompt}
      </span>
      {note && (
        <span style={{ marginTop: 8, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {note}
        </span>
      )}
      {aside}
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflowY: 'auto',
          minHeight: 0,
          paddingBottom: 4,
        }}
      >
        {targets.map((o) => {
          const tags = packTags?.get(o.name) ?? [];
          const on = picked === o.playerId;
          const hot = on || tags.length > 0;
          return (
            <button
              key={o.playerId}
              onClick={() => pick(o.playerId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 60,
                padding: '0 12px',
                borderRadius: 16,
                border: `1.5px solid ${hot ? pickColor : 'transparent'}`,
                background: on ? pickColor : hot ? 'rgba(224,106,94,.12)' : 'rgba(245,235,224,.05)',
                color: 'var(--text-primary)',
                opacity: picked && !on ? 0.4 : 1,
                textAlign: 'left',
                flexShrink: 0,
                transition: 'opacity .2s, background .2s',
              }}
            >
              <Avatar emoji={o.avatarEmoji} color={o.avatarColor} />
              <span style={{ flex: 1, fontSize: '1rem', fontWeight: 800 }}>{o.name}</span>
              {tags.length > 0 && (
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: on ? '#fff' : '#f09a8f' }}>
                  {tags.join(', ')}
                </span>
              )}
            </button>
          );
        })}
        {extraOption && (
          <button
            onClick={() => pick(extraOption.id)}
            style={{
              minHeight: 56,
              borderRadius: 16,
              border: '1.5px dashed var(--line2)',
              background: picked === extraOption.id ? 'var(--bg-card)' : 'transparent',
              color: 'var(--text-secondary)',
              opacity: picked && picked !== extraOption.id ? 0.4 : 1,
              fontWeight: 800,
              fontSize: '0.95rem',
              flexShrink: 0,
            }}
          >
            {extraOption.label}
          </button>
        )}
      </div>
    </div>
  );
}

/** Ghosts get a cooler grey screen, so a dead phone is never mistaken for a live one. */
function GhostView({
  my,
  tutorial,
  players,
}: {
  my: GluvoDobaControllerData;
  tutorial?: boolean;
  players: GluvoDobaPlayerInfo[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 14, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.8rem' }}>👻</span>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.4rem' }}>
          Mrtav si — ali vidiš sve
        </span>
      </div>
      {my.ghostQuestion && (
        <div
          style={{
            padding: 14,
            borderRadius: 18,
            background: 'rgba(194,155,71,.1)',
            border: '1px solid rgba(194,155,71,.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.35 }}>
            🕯️ Bajačica pita mrtve: da li je <b>{my.ghostQuestion.targetName}</b> vukodlak?
          </span>
          {my.hasGhostVoted ? (
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Odgovorio si mrtvima.</span>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                onClick={() => emit('gluvo:ghost-vote', { vote: 'da' })}
                style={{
                  minHeight: 52,
                  borderRadius: 14,
                  border: 'none',
                  background: '#e06a5e',
                  color: '#fff',
                  fontWeight: 800,
                }}
              >
                DA
              </button>
              <button
                onClick={() => emit('gluvo:ghost-vote', { vote: 'ne' })}
                style={{
                  minHeight: 52,
                  borderRadius: 14,
                  border: 'none',
                  background: 'rgba(245,235,224,.1)',
                  color: 'var(--text-primary)',
                  fontWeight: 800,
                }}
              >
                NE
              </button>
            </div>
          )}
          {tutorial && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Mrtve Sile Mraka smeju da lažu…
            </span>
          )}
        </div>
      )}
      <span style={eyebrow}>Sve uloge</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {my.allRoles?.map((r, i) => {
          const p = players.find((x) => x.name === r.name);
          const def = GLUVO_DOBA_ROLES[r.roleId];
          return (
            <div key={i} style={softRow}>
              <Avatar emoji={p?.avatarEmoji} color={p?.avatarColor} size={30} />
              <span style={{ flex: 1, fontWeight: 800 }}>
                {r.name}
                {p && !p.alive && ' 💀'}
              </span>
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: teamText(def.team) }}>
                {ROLE_EMOJI[r.roleId]} {def.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Vision history — exists only for Vračara and Bajačica; everyone else gets the same empty half. */
function HistoryPanel({ my }: { my: GluvoDobaControllerData }) {
  const seer = my.seerHistory ?? [];
  const bajanja = my.bajacicaHistory ?? [];
  if (seer.length === 0 && bajanja.length === 0) return null;
  const card: React.CSSProperties = {
    padding: '12px 14px',
    borderRadius: 14,
    background: 'rgba(143,163,217,.1)',
    fontSize: '0.88rem',
    lineHeight: 1.4,
    textAlign: 'left',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '34vh', overflowY: 'auto', flexShrink: 0 }}>
      <span style={eyebrow}>Tvoje vizije</span>
      {seer.map((e, i) => (
        <div key={`s${i}`} style={card}>
          <b>
            Noć {e.night} · {e.targetName}
          </b>
          <br />
          <span style={{ color: 'var(--text-secondary)' }}>{e.hintText}</span>
        </div>
      ))}
      {bajanja.map((e, i) => (
        <div key={`b${i}`} style={card}>
          <b>
            🕯️ Noć {e.night} · {e.targetName}
          </b>
          <br />
          <span style={{ color: 'var(--text-secondary)' }}>
            {e.blocked
              ? 'mrtvi su ćutali (pregažena si)'
              : e.da + e.ne === 0
                ? 'mrtvi još ćute — nema duhova'
                : `DA ${e.da} / NE ${e.ne}`}
          </span>
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
  players,
}: {
  packMates: NonNullable<GluvoDobaControllerData['packMates']>;
  players: GluvoDobaPlayerInfo[];
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        borderRadius: 20,
        background: 'rgba(224,106,94,.08)',
        border: '1px solid rgba(224,106,94,.25)',
        flexShrink: 0,
      }}
    >
      <span style={{ ...eyebrow, color: '#f09a8f' }}>🐺 Tvoje Sile Mraka</span>
      {packMates.map((m) => {
        const p = players.find((x) => x.playerId === m.playerId);
        return (
          <div key={m.playerId} style={{ ...softRow, opacity: p && !p.alive ? 0.5 : 1 }}>
            <Avatar emoji={p?.avatarEmoji} color={p?.avatarColor} size={30} dead={p ? !p.alive : false} />
            <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 800 }}>{m.name}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f09a8f' }}>
              {ROLE_EMOJI[m.roleId]} {GLUVO_DOBA_ROLES[m.roleId].name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BlockedBanner() {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 14,
        background: 'rgba(224,106,94,.14)',
        color: '#f09a8f',
        fontSize: '0.88rem',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      🐎 Todorac te je noćas pregazio — tvoja moć nije delovala!
    </div>
  );
}

/** Only on the Knez's phone; asks for confirmation before going public. */
function KnezRevealButton() {
  const [arming, setArming] = useState(false);
  if (!arming) {
    return (
      <button
        onClick={() => setArming(true)}
        style={{
          minHeight: 52,
          borderRadius: 16,
          border: '1.5px solid var(--accent)',
          background: 'transparent',
          color: 'var(--amber)',
          fontWeight: 800,
          fontSize: '0.95rem',
          flexShrink: 0,
        }}
      >
        👑 Otkrij se kao Knez
      </button>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, flexShrink: 0 }}>
      <button className="btn-primary" onClick={() => emit('gluvo:knez-reveal')}>
        👑 Da, otkrij me — glas ×2
      </button>
      <button className="btn-ghost" onClick={() => setArming(false)}>
        Odustani
      </button>
    </div>
  );
}

/** Big ring for the discussion clock — readable from across the table. */
function Ring({ seconds, total }: { seconds: number; total: number }) {
  const frac = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const s = Math.max(0, Math.ceil(seconds));
  return (
    <span
      style={{
        width: 150,
        height: 150,
        borderRadius: '50%',
        background: `conic-gradient(var(--accent) 0 ${frac * 100}%, rgba(245,235,224,.1) ${frac * 100}% 100%)`,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <span
        className="display"
        style={{
          width: 130,
          height: 130,
          borderRadius: '50%',
          background: 'var(--bg-primary)',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: '2.4rem',
        }}
      >
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </span>
    </span>
  );
}

export default function GluvoDobaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const isRemoteHost = usePlayerStore(
    (s) => s.room?.remoteHostPlayerId != null && s.room.remoteHostPlayerId === s.player?.id
  );
  // The discussion ring needs the phase's full length; the first value seen is it.
  const [discussionTotal, setDiscussionTotal] = useState<{ day: number; total: number } | null>(null);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as GluvoDobaHostData;
  const tutorial = data.tutorialMode === true;
  const my = (playerData[playerId] ?? { alive: false }) as unknown as GluvoDobaControllerData;
  const roleDef = my.roleId ? GLUVO_DOBA_ROLES[my.roleId] : null;
  const players = host.players ?? [];

  if (phase === 'diskusija' && (!discussionTotal || discussionTotal.day !== host.day)) {
    setDiscussionTotal({ day: host.day, total: Math.max(timeRemaining, 1) });
  }

  const night = phase === 'podela-uloga' || phase === 'noc' || phase === 'osveta';
  const ghost = !!roleDef && !my.alive && phase !== 'kraj' && phase !== 'ended' && phase !== 'podela-uloga';
  const ended = phase === 'kraj' || phase === 'ended';
  const backdrop = ended
    ? host.moranaWon
      ? BG.morana
      : host.winner === 'vukodlaci'
        ? BG.mrak
        : BG.selo
    : ghost
      ? BG.ghost
      : night
        ? BG.night
        : phase === 'zora'
          ? BG.dawn
          : null;

  const timed = !tutorial && ['noc', 'osveta', 'glasanje'].includes(phase);
  const subtitle =
    phase === 'podela-uloga'
      ? 'Podela uloga'
      : night
        ? `Noć ${host.day}`
        : phase === 'zora'
          ? `Zora · dan ${host.day}`
          : phase === 'diskusija'
            ? `Dan ${host.day} · rasprava`
            : phase === 'glasanje'
              ? `Dan ${host.day} · glasanje`
              : phase === 'presuda'
                ? `Dan ${host.day} · presuda`
                : 'Kraj partije';

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

  const screen = roleDef ? (
    <Screen
      phase={phase}
      my={my}
      host={host}
      players={players}
      tutorial={tutorial}
      isRemoteHost={isRemoteHost}
      timeRemaining={timeRemaining}
      discussionTotal={discussionTotal?.total ?? timeRemaining}
    />
  ) : (
    // Joined mid-game — no seat at this table.
    <div style={center}>
      <span style={{ fontSize: '2.6rem' }}>👀</span>
      <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
        Partija je u toku — posmatraj i uskači u sledeću!
      </p>
    </div>
  );

  return (
    <>
      {backdrop && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, background: backdrop, pointerEvents: 'none' }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        <GameFrame
          gameId="gluvo-doba"
          subtitle={subtitle}
          timeRemaining={timed ? timeRemaining : undefined}
          roundKey={phase === 'noc' ? host.day : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12, paddingTop: 14 }}>
            {tutorial && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
                {tutorialHint ? (
                  <p
                    key={`${phase}-${my.hasActed}-${my.canAct}`}
                    style={{
                      flex: 1,
                      margin: 0,
                      fontSize: '0.78rem',
                      background: 'rgba(194,155,71,0.1)',
                      border: '1px solid rgba(194,155,71,0.35)',
                      borderRadius: 12,
                      padding: '0.45rem 0.6rem',
                      lineHeight: 1.4,
                      animation: 'igra-pop .3s',
                    }}
                  >
                    🎓 {tutorialHint}
                  </p>
                ) : (
                  <span style={{ flex: 1 }} />
                )}
                <RolesInPlayButton host={host} />
              </div>
            )}
            {tutorial && isRemoteHost && phase !== 'ended' && (
              <button
                className="btn-ghost"
                onClick={() => socket.emit('host:game-action', { action: 'gluvo:next-phase' })}
                style={{ minHeight: 44, borderColor: 'var(--accent)', flexShrink: 0 }}
              >
                🎓 {GLUVO_INPUT_PHASES.has(phase) ? 'Preskoči — nastavi ▸' : 'Sledeća faza ▸'}
              </button>
            )}
            {screen}
          </div>
        </GameFrame>
      </div>
    </>
  );
}

function Screen({
  phase,
  my,
  host,
  players,
  tutorial,
  isRemoteHost,
  timeRemaining,
  discussionTotal,
}: {
  phase: string;
  my: GluvoDobaControllerData;
  host: GluvoDobaHostData;
  players: GluvoDobaPlayerInfo[];
  tutorial: boolean;
  isRemoteHost: boolean;
  timeRemaining: number;
  discussionTotal: number;
}) {
  const roleDef = GLUVO_DOBA_ROLES[my.roleId!];
  const isDark = roleDef.team === 'vukodlaci';
  const roleLine = `${ROLE_EMOJI[my.roleId!]} Ti si ${roleDef.name}`;
  const ghostView = <GhostView my={my} tutorial={tutorial} players={players} />;
  const avatarOf = (id: string) => players.find((p) => p.playerId === id);

  // --- podela-uloga (2a) ------------------------------------------------------
  if (phase === 'podela-uloga') {
    const t = TEAM[roleDef.team];
    return (
      <>
        <div style={{ ...center, gap: 10 }}>
          <span style={eyebrow}>Tvoja tajna uloga</span>
          {/* The card flips in, so a neighbour glancing over sees only the back. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, animation: 'igra-flip-in .4s ease-out' }}>
            <span
              style={{
                marginTop: 6,
                width: 128,
                height: 128,
                borderRadius: 36,
                background: t.tint + '.16)',
                border: `1.5px solid ${t.tint}.45)`,
                display: 'grid',
                placeItems: 'center',
                fontSize: '4.2rem',
              }}
            >
              {ROLE_EMOJI[my.roleId!]}
            </span>
            <span className="display" style={{ fontWeight: 800, fontSize: '2.6rem', lineHeight: 1, color: t.text }}>
              {roleDef.name}
            </span>
            <span
              style={{
                height: 28,
                padding: '0 12px',
                borderRadius: 999,
                background: t.tint + '.18)',
                color: t.text,
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {GLUVO_DOBA_TEAM_NAMES[roleDef.team]}
            </span>
            <span style={{ marginTop: 4, fontSize: '0.95rem', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
              {roleDef.description}
            </span>
          </div>
        </div>
        {isDark && my.packMates && my.packMates.length > 0 && <PackRoster packMates={my.packMates} players={players} />}
        {isDark && my.packMates && my.packMates.length === 0 && (
          <div
            style={{
              padding: 14,
              borderRadius: 20,
              background: 'rgba(224,106,94,.08)',
              border: '1px solid rgba(224,106,94,.25)',
              color: '#f09a8f',
              fontSize: '0.9rem',
              fontWeight: 700,
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            Sam si u Silama Mraka — nema saborca.
          </div>
        )}
        <span style={{ textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: 'var(--dim)', flexShrink: 0 }}>
          Nikome ne pokazuj ekran
        </span>
      </>
    );
  }

  // --- noc (2b / 2c) -------------------------------------------------------------
  if (phase === 'noc') {
    if (!my.alive) return ghostView;
    // Pack picks ride next to each name (dark phones only, from playerData).
    const packTags = new Map<string, string[]>();
    for (const p of my.packPicks ?? []) {
      packTags.set(p.targetName, [...(packTags.get(p.targetName) ?? []), p.name]);
    }
    if (my.canAct && !my.hasActed && my.targets) {
      const isMoranaOffNight = my.roleId === 'morana' && !my.moranaKillTonight;
      return (
        <TargetList
          key={`${phase}-${host.day}`}
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
          aside={
            isDark && my.packMates && my.packMates.length > 0 ? (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                {my.packMates.map((m) => {
                  const p = avatarOf(m.playerId);
                  return (
                    <span
                      key={m.playerId}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700, color: '#f09a8f' }}
                    >
                      <Avatar emoji={p?.avatarEmoji} color={p?.avatarColor} size={24} dead={p ? !p.alive : false} />
                      {m.name} · {ROLE_EMOJI[m.roleId]} {GLUVO_DOBA_ROLES[m.roleId].name}
                    </span>
                  );
                })}
              </div>
            ) : undefined
          }
          targets={my.targets}
          packTags={isDark ? packTags : undefined}
          onPick={(targetId) => emit('gluvo:night-action', { targetId })}
        />
      );
    }
    const acted = host.actedCount ?? 0;
    const total = host.totalActors ?? 0;
    return (
      <>
        <div style={center}>
          <span style={{ fontSize: '3rem', lineHeight: 1 }}>🌙</span>
          <span className="display" style={{ fontWeight: 700, fontSize: '1.9rem' }}>
            Selo spava…
          </span>
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{roleLine}</span>
          <div style={{ marginTop: 14, width: 200, height: 6, borderRadius: 3, background: 'rgba(245,235,224,.08)' }}>
            <div
              style={{
                width: `${total ? (acted / total) * 100 : 0}%`,
                height: '100%',
                borderRadius: 3,
                background: TEAM.neutralci.solid,
                transition: 'width .4s ease',
              }}
            />
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--dim)' }}>
            {acted}/{total} odigralo
          </span>
          {isDark && (my.packPicks?.length ?? 0) > 0 && (
            <div style={{ marginTop: 10, fontSize: '0.88rem', fontWeight: 700, color: '#f09a8f' }}>
              {my.packPicks!.map((p, i) => (
                <div key={i}>
                  🐺 {p.name} → {p.targetName}
                </div>
              ))}
            </div>
          )}
        </div>
        <HistoryPanel my={my} />
      </>
    );
  }

  // --- osveta ----------------------------------------------------------------------
  if (phase === 'osveta') {
    if (my.isAvenger && my.osvetaTargets) {
      return (
        <TargetList
          key={`${phase}-${host.day}`}
          prompt="🧵 Tvoja nit je presečena! Koga vodiš sa sobom?"
          targets={my.osvetaTargets}
          onPick={(targetId) => emit('gluvo:osveta', { targetId })}
        />
      );
    }
    return (
      <div style={center}>
        <span style={{ fontSize: '3rem', lineHeight: 1 }}>{host.osvetaPublic ? '🧵' : '🌙'}</span>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.7rem' }}>
          {host.osvetaPublic ? 'Suđaja se sveti!' : 'Noć se produžava…'}
        </span>
      </div>
    );
  }

  // --- zora (2d) ---------------------------------------------------------------------
  if (phase === 'zora') {
    if (!my.alive) return ghostView;
    const deaths = host.deaths ?? [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12, overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
          <span style={{ fontSize: '2.8rem', lineHeight: 1 }}>🌅</span>
          <span className="display" style={{ fontWeight: 800, fontSize: '2rem' }}>
            Zora je
          </span>
        </div>
        {my.blockedLastNight && <BlockedBanner />}
        {host.peacefulFirstNight && <DawnNote>🕊️ Prva noć je prošla mirno — bez krvi.</DawnNote>}
        {host.zduhacSaved && (
          <DawnNote>
            🌪️ Zduhać (<b>{host.zduhacSaved.name}</b>) je presreo napad u oblacima!
          </DawnNote>
        )}
        {deaths.map((d) => (
          <DeathCard key={d.playerId} death={d} avatar={avatarOf(d.playerId)} />
        ))}
        {deaths.length === 0 && !host.peacefulFirstNight && !host.zduhacSaved && (
          <DawnNote>Niko nije stradao ove noći.</DawnNote>
        )}
        {host.mutedToday && (
          <DawnNote>
            👹 <b>{host.mutedToday.name}</b> je preplašen — danas ne glasa.
          </DawnNote>
        )}
        {host.whisperTop && host.whisperTop.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <span style={eyebrow}>Šapat sumnje</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {host.whisperTop.map((w) => {
                const p = players.find((x) => x.name === w.name);
                return (
                  <span
                    key={w.name}
                    style={{
                      height: 36,
                      padding: '0 12px 0 6px',
                      borderRadius: 999,
                      background: 'rgba(11,22,40,.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: '0.88rem',
                      fontWeight: 800,
                    }}
                  >
                    <Avatar emoji={p?.avatarEmoji} color={p?.avatarColor} size={26} />
                    {w.name} · {w.count}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ flex: 1 }} />
        {my.canKnezReveal && <KnezRevealButton />}
        <HistoryPanel my={my} />
      </div>
    );
  }

  // --- diskusija (2e) --------------------------------------------------------------------
  if (phase === 'diskusija') {
    if (!my.alive) return ghostView;
    return (
      <>
        <div style={{ ...center, gap: 12 }}>
          <span style={{ fontSize: '2.4rem', lineHeight: 1 }}>🗣️</span>
          <span className="display" style={{ fontWeight: 800, fontSize: '2rem' }}>
            Raspravljajte!
          </span>
          {!tutorial && <Ring seconds={timeRemaining} total={discussionTotal} />}
          <span style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', maxWidth: '20rem' }}>
            Ko se noćas čudno ponašao? Pričajte uživo — glasanje stiže.
          </span>
        </div>
        {my.blockedLastNight && <BlockedBanner />}
        {host.knezRevealed && <KnezLine name={host.knezRevealed.name} />}
        {my.canKnezReveal && <KnezRevealButton />}
        <HistoryPanel my={my} />
        {/* U tutorialu globalno "Sledeća faza" dugme pokriva prelaz. */}
        {isRemoteHost && !tutorial && (
          <button
            className="btn-ghost"
            onClick={() => socket.emit('host:game-action', { action: 'gluvo:skip-discussion' })}
            style={{ flexShrink: 0 }}
          >
            Pređi na glasanje ▶
          </button>
        )}
      </>
    );
  }

  // --- glasanje (2f) ---------------------------------------------------------------------
  if (phase === 'glasanje') {
    if (!my.alive) return ghostView;
    if (my.muted) {
      return (
        <div style={center}>
          <span style={{ fontSize: '4rem', lineHeight: 1 }}>👹</span>
          <span className="display" style={{ fontWeight: 800, fontSize: '2rem' }}>
            Bauk te je uplašio!
          </span>
          <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: '20rem' }}>
            Od straha danas ne smeš da glasaš. Možeš da pričaš — ali tvoj glas se ne broji.
          </span>
        </div>
      );
    }
    const counter = (
      <span style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: 'var(--dim)', flexShrink: 0 }}>
        {host.votedCount ?? 0}/{host.totalVoters ?? 0} glasalo
      </span>
    );
    if (my.hasVoted) {
      return (
        <>
          <div style={center}>
            <span style={{ fontSize: '2.6rem', lineHeight: 1, animation: 'igra-pop .3s' }}>✅</span>
            <span className="display" style={{ fontWeight: 700, fontSize: '1.7rem' }}>
              Glas je zabeležen
            </span>
          </div>
          {counter}
        </>
      );
    }
    return (
      <>
        <TargetList
          key={`${phase}-${host.day}`}
          prompt="⚖️ Ko ide na vešala?"
          note={host.knezRevealed ? `👑 Knez ${host.knezRevealed.name} glasa duplo` : undefined}
          targets={my.voteOptions ?? []}
          onPick={(targetId) => emit('gluvo:vote', { targetId })}
          extraOption={{ id: 'skip', label: 'Preskoči — niko danas' }}
        />
        {my.canKnezReveal && <KnezRevealButton />}
        {counter}
      </>
    );
  }

  // --- presuda (2g) -------------------------------------------------------------------------
  if (phase === 'presuda') {
    const tally = host.voteTally ?? [];
    const max = Math.max(1, ...tally.map((t) => t.votes), host.skipVotes ?? 0);
    const lynched = host.lynched;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 14, overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', paddingTop: 8 }}>
          <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>⚖️</span>
          {lynched ? (
            <>
              <span style={{ ...eyebrow, fontSize: '0.8rem' }}>Selo je obesilo</span>
              <Avatar emoji={avatarOf(lynched.playerId)?.avatarEmoji} color={avatarOf(lynched.playerId)?.avatarColor} size={84} />
              <span className="display" style={{ fontWeight: 800, fontSize: '2.2rem', lineHeight: 1 }}>
                {lynched.name}
              </span>
              {/* The role lands half a second after the name, like a drumroll. */}
              <span style={{ opacity: 0, animation: 'igra-pop .4s ease-out .5s forwards' }}>
                <RevealChip roleId={lynched.roleId} team={lynched.team} />
              </span>
            </>
          ) : (
            <span className="display" style={{ fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.15 }}>
              Selo nije odlučilo — niko nije obešen.
            </span>
          )}
        </div>
        {host.osvetaVictim && (
          <DawnNote>
            🧵 Suđaja je povukla nit — <b>{host.osvetaVictim.name}</b> odlazi sa njom!{' '}
            <RevealChip roleId={host.osvetaVictim.roleId} team={host.osvetaVictim.team} />
          </DawnNote>
        )}
        {(tally.length > 0 || (host.skipVotes ?? 0) > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tally.map((t) => (
              <TallyRow
                key={t.playerId}
                label={t.name}
                votes={t.votes}
                max={max}
                avatar={avatarOf(t.playerId)}
                hot={lynched?.playerId === t.playerId}
              />
            ))}
            {(host.skipVotes ?? 0) > 0 && <TallyRow label="Preskok" votes={host.skipVotes ?? 0} max={max} />}
          </div>
        )}
      </div>
    );
  }

  // --- kraj / ended (2i) -----------------------------------------------------------------------
  if (phase === 'kraj' || phase === 'ended') {
    const iWon =
      (host.moranaWon && my.roleId === 'morana') ||
      (!host.moranaWon && roleDef.team === host.winner) ||
      (my.roleId === 'lesnik' && my.alive);
    const [icon, title] = host.moranaWon
      ? ['❄️', 'Morana je uzela selo!']
      : host.winner === 'vukodlaci'
        ? ['🐺', 'Sile Mraka su pobedile!']
        : ['🌾', 'Selo je pobedilo!'];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
          <span style={{ fontSize: '3rem', lineHeight: 1 }}>{icon}</span>
          <span className="display" style={{ fontWeight: 800, fontSize: '2rem', lineHeight: 1.05 }}>
            {title}
          </span>
          <span
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 999,
              background: 'rgba(250,246,240,.16)',
              fontSize: '0.9rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {iWon ? 'Slaviš pobedu 🎉' : 'Tvoja strana je pala…'}
          </span>
          {host.lesnikSurvived && (
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--amber)' }}>
              🌲 Lesnik ({host.lesnikSurvived.name}) je preživeo — pobeđuje uz pobednike!
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', minHeight: 0, flex: 1 }}>
          {host.finalRoles?.map((r) => {
            const def = GLUVO_DOBA_ROLES[r.roleId];
            return (
              <div key={r.playerId} style={{ ...softRow, background: 'rgba(11,22,40,.3)', flexShrink: 0 }}>
                <Avatar emoji={r.avatarEmoji} color={r.avatarColor} size={30} dead={!r.alive} />
                <span style={{ flex: 1, fontWeight: 800, opacity: r.alive ? 1 : 0.7 }}>
                  {r.name}
                  {!r.alive && ' 💀'}
                </span>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: teamText(def.team) }}>
                  {ROLE_EMOJI[r.roleId]} {def.name}
                </span>
              </div>
            );
          })}
        </div>
        {/* U tutorialu globalno "Sledeća faza" dugme završava igru. */}
        {isRemoteHost && phase === 'kraj' && !tutorial && (
          <button
            className="btn-primary"
            onClick={() => socket.emit('host:game-action', { action: 'gluvo:end-now' })}
            style={{ flexShrink: 0 }}
          >
            Nazad u sobu ▶
          </button>
        )}
      </div>
    );
  }

  return null;
}

function DawnNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 14,
        background: 'rgba(11,22,40,.3)',
        fontSize: '0.92rem',
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

/** One card per death: who, how, and the role if the village learned it. */
function DeathCard({ death, avatar }: { death: GluvoDobaDeath; avatar?: GluvoDobaPlayerInfo }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 18,
        background: 'rgba(11,22,40,.45)',
        flexShrink: 0,
        animation: 'igra-rise .4s ease-out',
      }}
    >
      <Avatar emoji={avatar?.avatarEmoji} color={avatar?.avatarColor} size={52} dead />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.3rem', lineHeight: 1 }}>
          {death.name}
        </span>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{causeText(death.cause)}</span>
        <span>
          <RevealChip roleId={death.roleId} team={death.team} />
        </span>
      </span>
    </div>
  );
}

function KnezLine({ name }: { name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 14,
        background: 'rgba(194,155,71,.14)',
        fontSize: '0.92rem',
        flexShrink: 0,
      }}
    >
      👑 <span style={{ flex: 1 }}>Knez sela: <b>{name}</b></span>
      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--amber)' }}>glas ×2</span>
    </div>
  );
}

function TallyRow({
  label,
  votes,
  max,
  avatar,
  hot,
}: {
  label: string;
  votes: number;
  max: number;
  avatar?: GluvoDobaPlayerInfo;
  hot?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
      {avatar ? <Avatar emoji={avatar.avatarEmoji} color={avatar.avatarColor} size={28} /> : <span style={{ width: 28 }} />}
      <span style={{ width: 84, fontWeight: 800, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(245,235,224,.08)' }}>
        <div
          style={{
            width: `${(votes / max) * 100}%`,
            height: '100%',
            borderRadius: 5,
            background: hot ? '#e06a5e' : 'var(--text-secondary)',
          }}
        />
      </div>
      <span className="display" style={{ width: 22, textAlign: 'right', fontWeight: 800 }}>
        {votes}
      </span>
    </div>
  );
}

// Faze u kojima igrači unose odluke — "sledeća faza" tu prinudno razrešava
// fazu sa dosad pristiglim akcijama, pa dugme menja tekst.
const GLUVO_INPUT_PHASES = new Set(['noc', 'osveta', 'glasanje']);
