import { useEffect, useRef, useState } from 'react';
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
import {
  BZ_POWER_TEXT,
  BZ_CHEATSHEET,
  bzTutorialControllerHint,
} from '@igra/shared';
import { BZCardFace, BZCardBack, BZCardGap } from './components/BZCard';

// In-game ekrani su namerno samo na srpskom (kao Kviz/Lažov klasa igara).

function send(action: string, data: Record<string, unknown> = {}) {
  socket.emit('game:player-action', { action, data });
}

export default function BoljiZivotController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const iAmRemoteHost = usePlayerStore(
    (s) =>
      !!s.room &&
      s.room.remoteHostPlayerId != null &&
      s.room.remoteHostPlayerId === s.player?.id
  );
  const haptics = useHaptics();

  const [blindOwnPos, setBlindOwnPos] = useState<number | null>(null);
  const [confirmCall, setConfirmCall] = useState(false);
  const [riskaPick, setRiskaPick] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [turnBannerId, setTurnBannerId] = useState(0);
  // "!" dugme objedinjuje tri brze akcije: slap, Zduhać reakciju i "Zavet!".
  // 'menu' = otvoren popup sa dostupnim akcijama; 'slap'/'zduhac' = izbor
  // karte za tu akciju. Sve je lokalno i tiho — ostali ne vide pritisak.
  const [bangMode, setBangMode] = useState<'menu' | 'slap' | 'zduhac' | null>(
    null
  );

  const phase = gameState?.phase ?? '';

  // Lokalna selekcija ne sme da preživi promenu pod-faze.
  useEffect(() => {
    setBlindOwnPos(null);
    setConfirmCall(false);
    setRiskaPick(false);
    setBangMode(null);
  }, [phase]);

  // "TVOJ POTEZ" — na uzlaznu ivicu (nije moj potez → jeste) zavibriraj i
  // pokaži krupni baner na ~1.8s. Izvedeno pre ranih return-a (redosled hookova).
  const amOnTurnNow = !!(
    gameState &&
    playerId &&
    phase === 'await-draw' &&
    (gameState.playerData[playerId] as { isMyTurn?: boolean } | undefined)
      ?.isMyTurn
  );
  const wasOnTurnRef = useRef(false);
  useEffect(() => {
    if (amOnTurnNow && !wasOnTurnRef.current) {
      haptics.success();
      setTurnBannerId((n) => n + 1);
    }
    wasOnTurnRef.current = amOnTurnNow;
  }, [amOnTurnNow, haptics]);

  // Slap prozor se otvorio i mene se tiče → kratka vibracija za pažnju.
  const slapForMe = !!(
    gameState &&
    playerId &&
    (gameState.data as unknown as BoljiZivotHostData | null)?.slap &&
    (gameState.playerData[playerId] as { canSlap?: boolean } | undefined)
      ?.canSlap
  );
  const hadSlapRef = useRef(false);
  useEffect(() => {
    if (slapForMe && !hadSlapRef.current) haptics.tap();
    hadSlapRef.current = slapForMe;
  }, [slapForMe, haptics]);

  // Novi slap prozor (ili zatvaranje) resetuje "!" stanje vezano za slap;
  // Zduhać izbor u toku ne prekidamo.
  const slapId =
    (gameState?.data as unknown as BoljiZivotHostData | null)?.slap?.id ?? null;
  useEffect(() => {
    setBangMode((m) => (m === 'slap' || m === 'menu' ? null : m));
  }, [slapId]);

  // Ciljan sam Zduhać prozorom → vibracija (imam samo ~3s da reagujem).
  const targetedNow = !!(
    gameState &&
    playerId &&
    gameState.phase === 'reaction' &&
    (gameState.playerData[playerId] as { amTargeted?: boolean } | undefined)
      ?.amTargeted
  );
  const wasTargetedRef = useRef(false);
  useEffect(() => {
    if (targetedNow && !wasTargetedRef.current) haptics.success();
    wasTargetedRef.current = targetedNow;
  }, [targetedNow, haptics]);

  if (!gameState || !playerId) return null;
  const data = gameState.data as unknown as BoljiZivotHostData;
  const me = (gameState.playerData[playerId] ?? {}) as unknown as BoljiZivotPlayerData;
  const tutorial = data.tutorialMode === true;
  // U tutorial modu faze pomera onaj ko drži kontrolu (remote-host / hostless kreator).
  const canAdvance = tutorial && iAmRemoteHost;

  if (!me.mySlots) {
    return (
      <Centered>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Igra je u toku — sačekaj sledeću partiju. 🧿
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
  // Zduhać ide kroz "!" dugme: grid postaje tappable tek posle izbora akcije.
  else if (phase === 'reaction' && me.amTargeted && bangMode === 'zduhac')
    gridMode = 'reaction';

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
    reaction: 'Tapni kartu za koju veruješ da je ZDUHAĆ!',
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

  // "!" dugme — koje brze akcije su trenutno dostupne?
  const slapAvailable = !!data.slap && me.canSlap;
  const zduhacAvailable = phase === 'reaction' && me.amTargeted;
  const zavetAvailable =
    phase === 'await-draw' && me.isMyTurn && !data.calledBy;
  const bangAvailable = slapAvailable || zduhacAvailable || zavetAvailable;

  // ------------------------------------------------------------ ekrani

  if (phase === 'final-leaderboard' || phase === 'ended') {
    const entries = data.leaderboard ?? [];
    const mine = entries.find((e) => e.playerId === playerId);
    return (
      <Centered>
        {canAdvance && phase === 'final-leaderboard' && (
          <TutorialNextButton label="Završi igru ▸" onTap={haptics.tap} />
        )}
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>
          Kraj partije — manje uroka je bolje!
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
              {mine.score} 🧿
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
                <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{e.score} 🧿</span>
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
        {canAdvance && (
          <div style={{ marginBottom: '0.5rem' }}>
            <TutorialNextButton
              label={
                data.roundNumber < data.totalRounds
                  ? 'Sledeća runda ▸'
                  : 'Konačni rezultati ▸'
              }
              onTap={haptics.tap}
            />
          </div>
        )}
        <p
          className="display"
          style={{ fontSize: '1.25rem', fontWeight: 700, textAlign: 'center', margin: '0 0 0.25rem' }}
        >
          {reveal.callerId
            ? reveal.callerSuccess
              ? `🏆 ${reveal.callerName} — ZAVET je uspeo!`
              : `💥 ${reveal.callerName} je pao — +20 kazne!`
            : 'Otkrivanje!'}
        </p>
        {myFam && (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
            Tvoja runda: <b>{myFam.roundSum} 🧿</b> (+{myFam.scoreAdded} → {myFam.totalScore})
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
                    {fam.roundSum} 🧿
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
        {tutorial ? (
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>🎓</span>
        ) : (
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: timeRemaining <= 5 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {timeRemaining}s
          </span>
        )}
      </div>

      {/* Krupni "TVOJ POTEZ" baner — kratko preko svega, bez blokiranja tapova */}
      {turnBannerId > 0 && amOnTurnNow && (
        <div
          key={turnBannerId}
          style={{
            position: 'fixed',
            top: '18%',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 500,
            pointerEvents: 'none',
            animation: 'igra-banner 1.8s ease-out forwards',
          }}
        >
          <span
            className="display"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1.5rem',
              padding: '0.6rem 1.6rem',
              borderRadius: '999px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
            }}
          >
            🎯 TVOJ POTEZ!
          </span>
        </div>
      )}

      {/* Tutorial: personalizovani savet za tekuću fazu */}
      {tutorial &&
        (() => {
          const hint = bzTutorialControllerHint(data.sub, {
            isMyTurn: me.isMyTurn,
            amTargeted: me.amTargeted,
            amRiskaHolder: me.amRiskaHolder,
          });
          if (!hint) return null;
          return (
            <p
              key={data.sub + String(me.isMyTurn)}
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-primary)',
                background: 'rgba(194,155,71,0.1)',
                border: '1px solid rgba(194,155,71,0.35)',
                borderRadius: '0.6rem',
                padding: '0.45rem 0.6rem',
                margin: 0,
                lineHeight: 1.4,
                animation: 'igra-pop .3s',
              }}
            >
              🎓 {hint}
            </p>
          );
        })()}

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

      {/* "!" — objedinjeno dugme za brze akcije: slap / Zduhać / Zavet.
          Klik otvara popup sa trenutno dostupnim akcijama (tiho — ostali
          ne vide pritisak). Slap prozor nema tajmer; Zduhać ima ~3s. */}
      {bangAvailable && bangMode === null && (
        <button
          onClick={tap(() => setBangMode('menu'))}
          aria-label="Brza akcija"
          style={{
            position: 'fixed',
            bottom: '4.5rem',
            right: '1rem',
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'var(--danger)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '1.9rem',
            lineHeight: 1,
            border: '3px solid rgba(255,255,255,0.35)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
            zIndex: 40,
            animation: 'igra-pop .25s, igra-pulse-ring 1.2s ease-out',
          }}
        >
          !
        </button>
      )}
      {bangMode === 'menu' && bangAvailable && (
        <div
          style={{
            position: 'fixed',
            bottom: '4.5rem',
            right: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            background: 'var(--bg-card)',
            border: '2px solid var(--danger)',
            borderRadius: '0.75rem',
            padding: '0.6rem',
            zIndex: 40,
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            animation: 'igra-pop .2s',
            minWidth: 200,
          }}
        >
          {slapAvailable && data.slap && (
            <button
              onClick={tap(() => setBangMode('slap'))}
              style={{
                padding: '0.55rem 0.8rem',
                borderRadius: '0.5rem',
                background: 'var(--danger)',
                color: '#fff',
                fontWeight: 700,
                textAlign: 'left',
              }}
            >
              ⚡ Slap — imam {data.slap.value}!
            </button>
          )}
          {zduhacAvailable && (
            <button
              onClick={tap(() => setBangMode('zduhac'))}
              style={{
                padding: '0.55rem 0.8rem',
                borderRadius: '0.5rem',
                background: 'var(--accent)',
                color: 'var(--bg-primary, #1D3557)',
                fontWeight: 700,
                textAlign: 'left',
              }}
            >
              🛡️ Zduhać — presretni napad!
            </button>
          )}
          {zavetAvailable &&
            (confirmCall ? (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={tap(() => {
                    send('bz:call');
                    setBangMode(null);
                    setConfirmCall(false);
                  })}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.8rem',
                    borderRadius: '0.5rem',
                    background: 'var(--danger)',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  Sigurno — ZAVET!
                </button>
                <button
                  onClick={tap(() => setConfirmCall(false))}
                  style={{
                    padding: '0.55rem 0.6rem',
                    borderRadius: '0.5rem',
                    background: 'transparent',
                    border: '1px solid var(--text-secondary)',
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  Ne
                </button>
              </div>
            ) : (
              <button
                onClick={tap(() => setConfirmCall(true))}
                style={{
                  padding: '0.55rem 0.8rem',
                  borderRadius: '0.5rem',
                  background: 'transparent',
                  border: '2px solid var(--danger)',
                  color: 'var(--danger)',
                  fontWeight: 700,
                  textAlign: 'left',
                }}
              >
                📣 Zavet! — imam najmanje uroka
              </button>
            ))}
          <button
            onClick={tap(() => {
              setBangMode(null);
              setConfirmCall(false);
            })}
            style={{
              padding: '0.35rem',
              borderRadius: '0.5rem',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontWeight: 700,
            }}
          >
            ✕ Zatvori
          </button>
        </div>
      )}
      {bangMode === 'slap' && slapAvailable && data.slap && (
        <div
          style={{
            background: 'rgba(231, 76, 60, 0.15)',
            border: '2px solid var(--danger)',
            borderRadius: '0.6rem',
            padding: '0.45rem',
            textAlign: 'center',
            animation: 'igra-pop .25s',
          }}
        >
          <p style={{ margin: '0 0 0.4rem', fontWeight: 700, fontSize: '0.85rem' }}>
            ⚡ Koja tvoja karta je {data.slap.value}? Promašaj = kaznena!
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.35rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
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
            <button
              onClick={tap(() => setBangMode(null))}
              style={{
                padding: '0.4rem 0.7rem',
                borderRadius: '0.5rem',
                background: 'transparent',
                border: '1px solid var(--text-secondary)',
                color: 'var(--text-secondary)',
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Zduhać prozor za mene — reaguje se kroz "!" dugme (~3s) */}
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
            🛡️ {data.reaction.actorName} cilja tvoju kartu{' '}
            {data.reaction.targetPos + 1}! ({timeRemaining}s)
          </p>
          {bangMode !== 'zduhac' ? (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Imaš Zduhaća? Brzo tapni „!" pa ga označi — inače akcija prolazi.
            </p>
          ) : (
            <>
              <p style={{ margin: '0.2rem 0 0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Tapni kartu za koju veruješ da je Zduhać — pogrešna = kaznena karta!
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
                Pusti — nemam Zduhaća
              </button>
            </>
          )}
        </div>
      )}

      {/* Grom — javno otkrivene karte */}
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
            ⚡ GROM — karte na sto!
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

      {/* Drekavac — vlasnik bira */}
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
          <p style={{ margin: 0, fontWeight: 700 }}>😱 Drekavac vrišti — kod tebe je!</p>
          {!riskaPick ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
              <ActionButton onClick={tap(() => send('bz:riska-draw'))}>
                🎴 Izvuci kartu i pošalji Drekavca na otpad
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
              Tapni tuđu kartu ispod — Drekavac ide tamo, njihova karta tebi.
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
          {/* Puls na promenu broja karata = neko je upravo vukao sa špila. */}
          <div
            key={data.drawCount}
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
              animation: 'igra-pop .3s',
            }}
          >
            🧿
          </div>
          Špil {data.drawCount}
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {data.discardTop ? (
            // Nova karta na vrhu otpada se "okreće" — ključ po broju + licu.
            <div
              key={`${data.discardCount}-${data.discardTop.v}-${data.discardTop.name}`}
              style={{ animation: 'igra-flip-in .35s' }}
            >
              <BZCardFace v={data.discardTop.v} name={data.discardTop.name} size={46} style={{ margin: '0 auto' }} />
            </div>
          ) : (
            <BZCardGap size={46} style={{ margin: '0 auto' }} />
          )}
          Otpad {data.discardCount}
        </div>
        {phase === 'holding' && me.isMyTurn && me.held && (
          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>
            <div
              key={`${me.held.v}-${me.held.name}`}
              style={{ animation: 'igra-flip-in .4s' }}
            >
              <BZCardFace v={me.held.v} name={me.held.name} size={56} style={{ margin: '0 auto', borderWidth: 3 }} />
            </div>
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
          actionId={data.lastActionId}
          selectedPos={blindOwnPos}
          interactive={gridMode !== null}
          onTap={(pos) => tap(() => onGridTap(pos))()}
        />
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
          🧿 Moji uroci: <b>{me.myScore}</b>
          {data.calledBy && (
            <>
              {' '}
              · 📣 {data.callerName} je pozvao ZAVET
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
          {!data.calledBy && (
            <p
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                margin: 0,
                textAlign: 'center',
              }}
            >
              Misliš da nosiš najmanje uroka? Tapni „!" pa „Zavet!"
            </p>
          )}
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

      {/* Tutorial: onaj ko drži kontrolu ručno pomera faze */}
      {canAdvance && (
        <TutorialNextButton
          label={
            BZ_WAIT_PHASES.has(phase) ? 'Sledeća faza ▸' : 'Preskoči potez ▸'
          }
          subtle={!BZ_WAIT_PHASES.has(phase)}
          onTap={haptics.tap}
        />
      )}

      {/* Tutorial: "?" podsetnik pravila */}
      {tutorial && (
        <>
          <button
            onClick={tap(() => setShowHelp(true))}
            aria-label="Pravila i karte"
            style={{
              position: 'fixed',
              right: '0.9rem',
              bottom: '0.9rem',
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: '1.3rem',
              fontWeight: 700,
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              zIndex: 400,
            }}
          >
            ?
          </button>
          {showHelp && <HelpSheet onClose={() => setShowHelp(false)} />}
        </>
      )}
    </div>
  );
}

// Faze pauze/prikaza — tu je "Sledeća faza" prirodan tok; u ulaznim fazama
// isto dugme znači "preskoči potez igrača" pa je vizuelno tiše.
const BZ_WAIT_PHASES = new Set(['peek-show', 'racija-show', 'reveal', 'final-leaderboard']);

function TutorialNextButton({
  label,
  subtle,
  onTap,
}: {
  label: string;
  subtle?: boolean;
  onTap?: () => void;
}) {
  return (
    <button
      onClick={() => {
        onTap?.();
        socket.emit('host:game-action', { action: 'bz:next-phase' });
      }}
      style={{
        padding: '0.55rem 1rem',
        borderRadius: '0.6rem',
        fontWeight: 700,
        fontSize: '0.85rem',
        width: '100%',
        background: subtle ? 'var(--bg-secondary)' : 'var(--accent)',
        color: subtle ? 'var(--text-secondary)' : '#fff',
        border: subtle ? '1px dashed rgba(194,155,71,0.5)' : 'none',
      }}
    >
      🎓 {label}
    </button>
  );
}

/** "?" podsetnik pravila — pun ekran, skroluje se, tutorial mod. */
function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 15, 35, 0.88)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: '18px 18px 0 0',
          border: '1px solid var(--line2, rgba(255,255,255,0.12))',
          borderBottom: 'none',
          width: '100%',
          maxWidth: '30rem',
          maxHeight: '85dvh',
          overflowY: 'auto',
          padding: '1rem 1rem 1.5rem',
          animation: 'igra-pop .25s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 className="display" style={{ margin: 0, fontSize: '1.15rem' }}>
            🧿 Zavet — podsetnik
          </h2>
          <button
            onClick={onClose}
            aria-label="Zatvori"
            style={{
              marginLeft: 'auto',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
        {BZ_CHEATSHEET.map((section) => (
          <div key={section.title} style={{ marginBottom: '0.8rem' }}>
            <p
              style={{
                margin: '0 0 0.3rem',
                fontWeight: 700,
                fontSize: '0.9rem',
                color: 'var(--accent)',
              }}
            >
              {section.title}
            </p>
            {section.lines.map((line, i) => (
              <p
                key={i}
                style={{
                  margin: '0 0 0.25rem',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  color: 'var(--text-primary)',
                }}
              >
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
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
      return 'GROM!';
    case 'reaction':
      return me.amTargeted ? 'ZDUHAĆ?' : `Čeka se ${data.reaction?.targetName}…`;
    case 'riska':
      return me.amRiskaHolder ? 'Drekavac je kod tebe!' : `${data.riska?.holderName} igra dodatni potez…`;
    default:
      return '';
  }
}

function MyGrid({
  me,
  visible,
  changed,
  actionId,
  selectedPos,
  interactive,
  onTap,
}: {
  me: BoljiZivotPlayerData;
  visible: Map<number, { v: number; name: string }>;
  changed: Set<number>;
  actionId: number;
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
        const raw = seen ? (
          <BZCardFace v={seen.v} name={seen.name} size={size} />
        ) : (
          <BZCardBack
            pos={slot.pos}
            size={size}
            highlight={changed.has(slot.pos) || selectedPos === slot.pos}
          />
        );
        // Viđena karta uleće flipom; upravo promenjena se prodrma — jasno je
        // ŠTA se desilo i na kom mestu, čak i kad je lice tajna.
        const inner = seen ? (
          <div key={`f-${slot.pos}-${seen.v}`} style={{ animation: 'igra-flip-in .35s' }}>
            {raw}
          </div>
        ) : changed.has(slot.pos) ? (
          <div key={`c-${slot.pos}-${actionId}`} style={{ animation: 'igra-shake .55s' }}>
            {raw}
          </div>
        ) : (
          raw
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
                const inner = changed.has(slot.pos) ? (
                  <div
                    key={`c-${slot.pos}-${data.lastActionId}`}
                    style={{ animation: 'igra-shake .55s' }}
                  >
                    <BZCardBack pos={slot.pos} size={34} highlight />
                  </div>
                ) : (
                  <BZCardBack pos={slot.pos} size={34} />
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
