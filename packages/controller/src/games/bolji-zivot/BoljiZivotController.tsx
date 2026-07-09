import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { useHaptics } from '../../hooks/useHaptics';
import type {
  BoljiZivotHostData,
  BoljiZivotPlayerData,
  BZFamilyPublic,
} from '@igra/shared';
import { BZ_POWER_TEXT } from '@igra/shared';
import { BZCardFace, BZCardBack, BZCardGap } from './components/BZCard';

// In-game ekrani su namerno samo na srpskom (kao Kviz/Lažov klasa igara).

function send(action: string, data: Record<string, unknown> = {}) {
  socket.emit('game:player-action', { action, data });
}

export default function BoljiZivotController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const haptics = useHaptics();

  const [blindOwnPos, setBlindOwnPos] = useState<number | null>(null);
  const [confirmCall, setConfirmCall] = useState(false);
  const [riskaPick, setRiskaPick] = useState(false);

  const phase = gameState?.phase ?? '';

  // Lokalna selekcija ne sme da preživi promenu pod-faze.
  useEffect(() => {
    setBlindOwnPos(null);
    setConfirmCall(false);
    setRiskaPick(false);
  }, [phase]);

  if (!gameState || !playerId) return null;
  const data = gameState.data as unknown as BoljiZivotHostData;
  const me = (gameState.playerData[playerId] ?? {}) as unknown as BoljiZivotPlayerData;

  if (!me.mySlots) {
    return (
      <Centered>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Igra je u toku — sačekaj sledeću partiju. 🌰
        </p>
      </Centered>
    );
  }

  const { timeRemaining } = gameState;
  const myVisible = new Map(
    (me.visible ?? [])
      .filter((r) => r.playerId === playerId)
      .map((r) => [r.pos, r])
  );
  const othersVisible = (me.visible ?? []).filter((r) => r.playerId !== playerId);
  const myChanged = new Set(
    (data.changedSlots ?? [])
      .filter((c) => c.playerId === playerId)
      .map((c) => c.pos)
  );

  const tap = (fn: () => void) => () => {
    haptics.tap();
    fn();
  };

  // Šta znači tap na moju kartu u tekućoj pod-fazi?
  type GridMode =
    | 'peek'
    | 'swap'
    | 'power-own'
    | 'blind-own'
    | 'power-swap'
    | 'reaction'
    | null;
  let gridMode: GridMode = null;
  if (phase === 'peeking' && (me.peeksLeft ?? 0) > 0) gridMode = 'peek';
  else if (phase === 'holding' && me.isMyTurn) gridMode = 'swap';
  else if (phase === 'power-select' && me.isMyTurn && data.power?.kind === 'peek-own')
    gridMode = 'power-own';
  else if (phase === 'power-select' && me.isMyTurn && data.power?.kind === 'blind-swap')
    gridMode = 'blind-own';
  else if (phase === 'power-look' && me.isMyTurn) gridMode = 'power-swap';
  else if (phase === 'reaction' && me.amTargeted) gridMode = 'reaction';

  const onGridTap = (pos: number) => {
    switch (gridMode) {
      case 'peek':
        send('bz:peek', { pos });
        break;
      case 'swap':
        send('bz:swap', { pos });
        break;
      case 'power-own':
        send('bz:power-select', { pos });
        break;
      case 'blind-own':
        setBlindOwnPos(pos);
        break;
      case 'power-swap':
        send('bz:power-swap', { ownPos: pos });
        break;
      case 'reaction':
        send('bz:reaction', { pos });
        break;
    }
  };

  const gridHint: Record<Exclude<GridMode, null>, string> = {
    peek: `Tapni kartu da je pogledaš (još ${me.peeksLeft ?? 0})`,
    swap: 'Tapni svoju kartu da je zameniš držanom',
    'power-own': 'Tapni svoju kartu da je pogledaš',
    'blind-own': 'Korak 1: tapni SVOJU kartu za slepu zamenu',
    'power-swap': 'Tapni svoju kartu da je zameniš viđenom — ili ostavi',
    reaction: 'Tapni kartu za koju veruješ da je POPARA!',
  };

  // Biranje tuđe karte (mete) — kada je opponents board interaktivan?
  const pickOther =
    (phase === 'power-select' &&
      me.isMyTurn &&
      (data.power?.kind === 'peek-other' ||
        data.power?.kind === 'look-swap' ||
        (data.power?.kind === 'blind-swap' && blindOwnPos !== null))) ||
    (phase === 'riska' && me.amRiskaHolder && riskaPick);

  const onOtherTap = (targetId: string, pos: number) => {
    if (phase === 'riska') {
      send('bz:riska-swap', { playerId: targetId, pos });
      return;
    }
    if (data.power?.kind === 'blind-swap') {
      send('bz:power-select', { ownPos: blindOwnPos, playerId: targetId, pos });
    } else {
      send('bz:power-select', { playerId: targetId, pos });
    }
  };

  // ------------------------------------------------------------ ekrani

  if (phase === 'final-leaderboard' || phase === 'ended') {
    const entries = data.leaderboard ?? [];
    const mine = entries.find((e) => e.playerId === playerId);
    return (
      <Centered>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>
          Kraj partije — manje oraha je bolje!
        </p>
        {mine && (
          <>
            <p
              className="display text-grad"
              style={{ fontSize: '4rem', fontWeight: 700, margin: 0, animation: 'igra-pop .5s' }}
            >
              {mine.rank === 1 ? '🏆' : `#${mine.rank}`}
            </p>
            <p className="display" style={{ fontSize: '1.6rem', fontWeight: 600, margin: 0 }}>
              {mine.score} 🌰
            </p>
          </>
        )}
        {hostless && (
          <div style={{ width: '100%', marginTop: '0.75rem' }}>
            {entries.map((e) => (
              <div
                key={e.playerId}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0.5rem',
                  background: e.playerId === playerId ? 'var(--bg-card)' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 700, minWidth: '2rem' }}>#{e.rank}</span>
                <span style={{ color: e.avatarColor, fontWeight: 600 }}>{e.name}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{e.score} 🌰</span>
              </div>
            ))}
          </div>
        )}
      </Centered>
    );
  }

  if (phase === 'reveal' && data.reveal) {
    const reveal = data.reveal;
    const myFam = reveal.families.find((f) => f.playerId === playerId);
    return (
      <div style={{ padding: '0.75rem', overflowY: 'auto', height: '100%' }}>
        <p
          className="display"
          style={{ fontSize: '1.25rem', fontWeight: 700, textAlign: 'center', margin: '0 0 0.25rem' }}
        >
          {reveal.callerId
            ? reveal.callerSuccess
              ? `🏆 ${reveal.callerName} — BOLJI ŽIVOT je uspeo!`
              : `💥 ${reveal.callerName} je pao — +20 kazne!`
            : 'Otkrivanje!'}
        </p>
        {myFam && (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
            Tvoja runda: <b>{myFam.roundSum} 🌰</b> (+{myFam.scoreAdded} → {myFam.totalScore})
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[...reveal.families]
            .sort((a, b) => a.roundSum - b.roundSum)
            .map((fam) => (
              <div
                key={fam.playerId}
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: '0.6rem',
                  padding: '0.5rem',
                  border: reveal.winnerIds.includes(fam.playerId)
                    ? '2px solid var(--success)'
                    : '2px solid transparent',
                }}
              >
                <div style={{ display: 'flex', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 700, color: fam.avatarColor }}>
                    {fam.name}
                    {fam.isCaller ? ' 📣' : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                    {fam.roundSum} 🌰
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {fam.cards.map((c) => (
                    <BZCardFace key={c.pos} v={c.v} name={c.name} size={44} paired={c.paired} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------- glavni raspored

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.6rem',
        gap: '0.5rem',
        overflowY: 'auto',
      }}
    >
      {/* Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span>
          R{data.roundNumber}/{data.totalRounds}
        </span>
        <span style={{ opacity: 0.5 }}>•</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {statusLine(phase, data, me)}
        </span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: timeRemaining <= 5 ? 'var(--danger)' : 'var(--text-primary)' }}>
          {timeRemaining}s
        </span>
      </div>

      {/* Poslednji događaj */}
      {data.lastAction && (
        <p
          key={data.lastActionId}
          style={{
            fontSize: '0.78rem',
            color: 'var(--accent)',
            margin: 0,
            textAlign: 'center',
            animation: 'igra-pop .3s',
          }}
        >
          {data.lastAction}
        </p>
      )}

      {/* SLAP prozor — uvek odvojena traka, tap na broj karte */}
      {data.slap && me.canSlap && (
        <div
          style={{
            background: 'rgba(231, 76, 60, 0.15)',
            border: '2px solid var(--danger)',
            borderRadius: '0.6rem',
            padding: '0.45rem',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 0.35rem', fontWeight: 700, fontSize: '0.85rem' }}>
            ⚡ SLAP! Imaš li {data.slap.value}? ({data.slap.secondsLeft}s)
          </p>
          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
            {me.mySlots
              .filter((s) => s.present)
              .map((s) => (
                <button
                  key={s.pos}
                  onClick={tap(() => send('bz:slap', { pos: s.pos }))}
                  style={{
                    padding: '0.4rem 0.7rem',
                    borderRadius: '0.5rem',
                    background: 'var(--danger)',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  #{s.pos + 1}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Popara prozor za mene */}
      {phase === 'reaction' && me.amTargeted && data.reaction && (
        <div
          style={{
            background: 'rgba(194,155,71,0.15)',
            border: '2px solid var(--accent)',
            borderRadius: '0.6rem',
            padding: '0.5rem',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>
            📋 {data.reaction.actorName} cilja tvoju kartu {data.reaction.targetPos + 1}!
          </p>
          <p style={{ margin: '0.2rem 0 0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Tapni kartu za koju veruješ da je Popara — pogrešna = kaznena karta!
          </p>
          <button
            onClick={tap(() => send('bz:reaction-pass'))}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '0.5rem',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            Pusti — nemam Poparu
          </button>
        </div>
      )}

      {/* Racija — javno otkrivene karte */}
      {phase === 'racija-show' && data.racija && (
        <div
          style={{
            background: 'rgba(231, 76, 60, 0.12)',
            border: '2px solid var(--danger)',
            borderRadius: '0.6rem',
            padding: '0.5rem',
          }}
        >
          <p style={{ margin: '0 0 0.4rem', fontWeight: 700, textAlign: 'center', fontSize: '0.9rem' }}>
            🚨 RACIJA — karte na sto!
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {data.racija.reveals.map((r) => {
              const fam = data.families.find((f) => f.playerId === r.playerId);
              return (
                <div key={`${r.playerId}-${r.pos}`} style={{ textAlign: 'center' }}>
                  <BZCardFace v={r.v} name={r.name} size={48} />
                  <p style={{ fontSize: '0.65rem', margin: '0.15rem 0 0', color: fam?.avatarColor }}>
                    {fam?.name} #{r.pos + 1}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Riska — vlasnik bira */}
      {phase === 'riska' && me.amRiskaHolder && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '2px solid var(--accent)',
            borderRadius: '0.6rem',
            padding: '0.6rem',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>👵 Riska se oglašava — kod tebe je!</p>
          {!riskaPick ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
              <ActionButton onClick={tap(() => send('bz:riska-draw'))}>
                🎴 Izvuci kartu i pošalji Risku na otpad
              </ActionButton>
              <ActionButton onClick={tap(() => setRiskaPick(true))}>
                😈 Uvali je drugom igraču
              </ActionButton>
              <ActionButton secondary onClick={tap(() => send('bz:riska-skip'))}>
                Ostavi je — idemo na otkrivanje
              </ActionButton>
            </div>
          ) : (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Tapni tuđu kartu ispod — Riska ide tamo, njihova karta tebi.
            </p>
          )}
        </div>
      )}

      {/* Viđene tuđe karte (peek-other / look-swap) */}
      {othersVisible.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.25rem' }}>
            👁️ Vidiš (zapamti!):
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
            {othersVisible.map((r) => {
              const fam = data.families.find((f) => f.playerId === r.playerId);
              return (
                <div key={`${r.playerId}-${r.pos}`} style={{ textAlign: 'center' }}>
                  <BZCardFace v={r.v} name={r.name} size={56} />
                  <p style={{ fontSize: '0.65rem', margin: '0.15rem 0 0', color: fam?.avatarColor }}>
                    {fam?.name} #{r.pos + 1}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Protivnici — meta ili mini sto (hostless) */}
      {(pickOther || hostless) && (
        <OpponentsBoard
          data={data}
          myId={playerId}
          interactive={pickOther}
          onTap={(pid, pos) => tap(() => onOtherTap(pid, pos))()}
        />
      )}

      {/* Centar stola: špil + otpad */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
        }}
      >
        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          <div
            style={{
              width: 46,
              height: 64,
              borderRadius: 7,
              border: '2px solid rgba(194,155,71,0.45)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              margin: '0 auto',
            }}
          >
            🌰
          </div>
          Špil {data.drawCount}
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {data.discardTop ? (
            <BZCardFace v={data.discardTop.v} name={data.discardTop.name} size={46} style={{ margin: '0 auto' }} />
          ) : (
            <BZCardGap size={46} style={{ margin: '0 auto' }} />
          )}
          Otpad {data.discardCount}
        </div>
        {phase === 'holding' && me.isMyTurn && me.held && (
          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>
            <BZCardFace v={me.held.v} name={me.held.name} size={56} style={{ margin: '0 auto', borderWidth: 3 }} />
            U ruci
          </div>
        )}
      </div>

      {/* Moja porodica */}
      <div style={{ textAlign: 'center' }}>
        {gridMode && (
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', margin: '0 0 0.3rem' }}>
            {gridHint[gridMode]}
          </p>
        )}
        <MyGrid
          me={me}
          visible={myVisible}
          changed={myChanged}
          selectedPos={blindOwnPos}
          interactive={gridMode !== null}
          onTap={(pos) => tap(() => onGridTap(pos))()}
        />
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
          🌰 Moji orasi: <b>{me.myScore}</b>
          {data.calledBy && (
            <>
              {' '}
              · 📣 {data.callerName} je pozvao BOLJI ŽIVOT
            </>
          )}
        </p>
      </div>

      {/* Akcije na potezu */}
      {phase === 'await-draw' && me.isMyTurn && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <ActionButton onClick={tap(() => send('bz:draw'))}>
            🎴 Vuci sa špila
          </ActionButton>
          {data.discardTop && (
            <ActionButton secondary onClick={tap(() => send('bz:take'))}>
              ♻️ Uzmi sa otpada: {data.discardTop.name} ({data.discardTop.v})
            </ActionButton>
          )}
          {!data.calledBy &&
            (confirmCall ? (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <ActionButton danger onClick={tap(() => send('bz:call'))}>
                  Sigurno — BOLJI ŽIVOT!
                </ActionButton>
                <ActionButton secondary onClick={tap(() => setConfirmCall(false))}>
                  Ipak ne
                </ActionButton>
              </div>
            ) : (
              <ActionButton danger onClick={tap(() => setConfirmCall(true))}>
                📣 BOLJI ŽIVOT!
              </ActionButton>
            ))}
        </div>
      )}

      {phase === 'holding' && me.isMyTurn && !me.heldFromDiscard && me.held && (
        <ActionButton onClick={tap(() => send('bz:discard'))}>
          {me.held.v >= 5 && me.held.v <= 9
            ? `⚡ Baci i aktiviraj: ${BZ_POWER_TEXT[powerKindOf(me.held.v)!]}`
            : '🗑️ Baci na otpad'}
        </ActionButton>
      )}

      {phase === 'power-look' && me.isMyTurn && (
        <ActionButton secondary onClick={tap(() => send('bz:power-keep'))}>
          Ostavi — ne menjam
        </ActionButton>
      )}

      {phase === 'peek-show' && me.isMyTurn && (
        <ActionButton secondary onClick={tap(() => send('bz:done'))}>
          ✅ Zapamtio sam
        </ActionButton>
      )}
    </div>
  );
}

function powerKindOf(v: number) {
  switch (v) {
    case 5:
      return 'peek-own' as const;
    case 6:
      return 'peek-other' as const;
    case 7:
      return 'blind-swap' as const;
    case 8:
      return 'raid' as const;
    case 9:
      return 'look-swap' as const;
    default:
      return null;
  }
}

function statusLine(
  phase: string,
  data: BoljiZivotHostData,
  me: BoljiZivotPlayerData
): string {
  switch (phase) {
    case 'peeking':
      return 'Pogledaj 2 svoje karte i zapamti ih!';
    case 'await-draw':
      return me.isMyTurn ? 'TVOJ POTEZ' : `Na potezu: ${data.currentPlayerName}`;
    case 'holding':
      return me.isMyTurn ? 'Zameni ili baci' : `${data.currentPlayerName} drži kartu`;
    case 'power-select':
      return me.isMyTurn
        ? data.power
          ? BZ_POWER_TEXT[data.power.kind]
          : 'Biraj metu'
        : `${data.power?.actorName ?? ''} bira metu…`;
    case 'power-look':
      return me.isMyTurn ? 'Zameni ili ostavi' : `${data.power?.actorName ?? ''} odlučuje…`;
    case 'peek-show':
      return me.isMyTurn ? 'Zapamti!' : `${data.currentPlayerName} pamti viđeno…`;
    case 'racija-show':
      return 'RACIJA!';
    case 'reaction':
      return me.amTargeted ? 'POPARA?' : `Čeka se ${data.reaction?.targetName}…`;
    case 'riska':
      return me.amRiskaHolder ? 'Riska je kod tebe!' : `${data.riska?.holderName} igra dodatni potez…`;
    default:
      return '';
  }
}

function MyGrid({
  me,
  visible,
  changed,
  selectedPos,
  interactive,
  onTap,
}: {
  me: BoljiZivotPlayerData;
  visible: Map<number, { v: number; name: string }>;
  changed: Set<number>;
  selectedPos: number | null;
  interactive: boolean;
  onTap: (pos: number) => void;
}) {
  const slots = me.mySlots;
  const size = 74;
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: `${(size + 10) * 4}px`,
        margin: '0 auto',
      }}
    >
      {slots.map((slot) => {
        if (!slot.present) return <BZCardGap key={slot.pos} size={size} />;
        const seen = visible.get(slot.pos);
        const inner = seen ? (
          <BZCardFace v={seen.v} name={seen.name} size={size} />
        ) : (
          <BZCardBack
            pos={slot.pos}
            size={size}
            highlight={changed.has(slot.pos) || selectedPos === slot.pos}
          />
        );
        if (!interactive) return <div key={slot.pos}>{inner}</div>;
        return (
          <button
            key={slot.pos}
            onClick={() => onTap(slot.pos)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

function OpponentsBoard({
  data,
  myId,
  interactive,
  onTap,
}: {
  data: BoljiZivotHostData;
  myId: string;
  interactive: boolean;
  onTap: (playerId: string, pos: number) => void;
}) {
  const others = data.families.filter((f: BZFamilyPublic) => f.playerId !== myId);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        background: interactive ? 'rgba(194,155,71,0.08)' : 'transparent',
        border: interactive ? '1px solid rgba(194,155,71,0.35)' : 'none',
        borderRadius: '0.6rem',
        padding: interactive ? '0.4rem' : 0,
      }}
    >
      {interactive && (
        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', margin: 0, textAlign: 'center' }}>
          Tapni tuđu kartu — meta!
        </p>
      )}
      {others.map((fam) => {
        const isCurrent = data.currentPlayerId === fam.playerId;
        const changed = new Set(
          (data.changedSlots ?? [])
            .filter((c) => c.playerId === fam.playerId)
            .map((c) => c.pos)
        );
        return (
          <div key={fam.playerId} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: fam.avatarColor,
                width: '76px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                opacity: fam.connected ? 1 : 0.5,
              }}
            >
              {isCurrent ? '▶ ' : ''}
              {fam.name}
              {fam.isCaller ? ' 📣' : ''}
            </span>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {fam.slots.map((slot) => {
                if (!slot.present) return <BZCardGap key={slot.pos} size={34} />;
                const inner = (
                  <BZCardBack pos={slot.pos} size={34} highlight={changed.has(slot.pos)} />
                );
                if (!interactive) return <div key={slot.pos}>{inner}</div>;
                return (
                  <button
                    key={slot.pos}
                    onClick={() => onTap(fam.playerId, slot.pos)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  secondary,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.7rem 1rem',
        borderRadius: '0.7rem',
        fontWeight: 700,
        fontSize: '0.95rem',
        width: '100%',
        background: danger
          ? 'var(--danger)'
          : secondary
            ? 'var(--bg-secondary)'
            : 'var(--accent)',
        color: secondary ? 'var(--text-primary)' : '#fff',
      }}
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '0.75rem',
        padding: '1.25rem',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}
