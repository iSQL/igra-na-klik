import { useEffect, useState } from 'react';
import type { DrawOp, PlayerAward, PublicPlayer } from '@igra/shared';
import { GAME_DEFINITIONS } from '@igra/shared';
import { socket } from './socket';
import { usePlayerStore } from './store/playerStore';
import { useGameStore } from './store/gameStore';
import { useNavStore } from './store/navStore';
import { useWakeLock } from './hooks/useWakeLock';
import { prefetchGameComponents } from './games/registry';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameSelectScreen } from './screens/GameSelectScreen';
import { GameScreen } from './screens/GameScreen';
import { BackButtonGuard } from './components/BackButtonGuard';
import { ChatHead } from './components/ChatHead';
import { KnockBanner } from './components/KnockBanner';
import { ConnectionStatus, ProblemScreen } from './components/ConnectionStatus';
import { RulesScreen } from './components/RulesScreen';
import { HostlessLeaderboard } from './components/HostlessLeaderboard';
import { bindKnockSocket } from './store/knockStore';
import { bindFlowSocket } from './store/flowStore';
import { markSeen } from './components/FirstTimeHint';
import { useT } from './i18n/useT';

function GameEndedOverlay({
  placement,
  stoppedEarly,
}: {
  /** Set when the host ended the game early ("Prekinuto posle 4/10"). */
  stoppedEarly: { round: number; totalRounds: number } | null;
  placement: {
    rank: number;
    points: number;
    award: PlayerAward | null;
    standings: {
      playerId: string;
      name: string;
      avatarColor: string;
      score: number;
      rank: number;
    }[];
  } | null;
}) {
  const t = useT();
  const myId = usePlayerStore.getState().player?.id;
  const toneColor: Record<PlayerAward['tone'], string> = {
    positive: 'var(--success)',
    shame: 'var(--danger)',
    neutral: 'var(--accent)',
  };
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'radial-gradient(600px 400px at 50% 30%, rgba(194,155,71,.35), rgba(11,23,40,.96))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 900,
        padding: '1.5rem',
      }}
    >
      {/* Kraj igre (2c): confetti only for the top three. */}
      {placement && placement.rank <= 3 && <Confetti />}
      <div
        style={{
          textAlign: 'center',
          animation: placement && placement.rank <= 3 ? 'igra-pop .5s' : 'igra-fade .4s ease',
          // Solid card so the overlay text never bleeds into the game
          // screen still rendered behind the translucent gold gradient.
          background: 'rgba(11,23,40,.92)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          border: '1px solid var(--line2)',
          borderRadius: '20px',
          padding: '1.6rem 1.5rem',
          maxWidth: '340px',
          boxShadow: '0 18px 50px rgba(0,0,0,.5)',
        }}
      >
        <p className="display" style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>
          {t('reconnect.gameEnded')}
        </p>
        {stoppedEarly && (
          <p
            style={{
              margin: '0.35rem 0 0',
              fontSize: '0.85rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: 'var(--amber)',
            }}
          >
            {stoppedEarly.totalRounds > 0
              ? t('gameEnd.stoppedAfter', {
                  round: stoppedEarly.round,
                  total: stoppedEarly.totalRounds,
                })
              : t('gameEnd.stopped')}
          </p>
        )}
        {placement && (
          <p
            className="display"
            style={{
              marginTop: '0.9rem',
              fontSize: '1.5rem',
              fontWeight: 700,
              display: 'inline-block',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              padding: '0.7rem 1.4rem',
              borderRadius: '16px',
              animation: 'igra-pop .6s',
            }}
          >
            {placement.rank === 1 && '🥇 '}
            {placement.rank === 2 && '🥈 '}
            {placement.rank === 3 && '🥉 '}
            {t('gameEnd.placement', {
              rank: placement.rank,
              points: placement.points,
            })}
          </p>
        )}
        {placement?.award && (
          <div
            style={{
              marginTop: '0.9rem',
              background: 'var(--bg-secondary)',
              border: `1px solid ${toneColor[placement.award.tone]}`,
              borderRadius: '16px',
              padding: '0.9rem 1rem',
              animation: 'igra-pop .7s',
            }}
          >
            <div style={{ fontSize: '2rem', lineHeight: 1 }}>
              {placement.award.emoji}
            </div>
            <p
              className="display"
              style={{
                margin: '0.35rem 0 0',
                fontSize: '1.15rem',
                fontWeight: 800,
                color: toneColor[placement.award.tone],
              }}
            >
              {placement.award.title}
            </p>
            {placement.award.subtitle && (
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {placement.award.subtitle}
              </p>
            )}
          </div>
        )}
        {placement && placement.standings.length > 0 && (
          <div
            style={{
              marginTop: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              maxHeight: '38vh',
              overflowY: 'auto',
              textAlign: 'left',
            }}
          >
            {/* Same standings as every game's own (Kontroler kit 2f). */}
            <HostlessLeaderboard
              title=""
              entries={placement.standings}
              myPlayerId={myId ?? ''}
              embedded
            />
          </div>
        )}
        <p
          style={{
            color: 'var(--text-secondary)',
            marginTop: '0.8rem',
            fontSize: '0.95rem',
            fontWeight: 700,
          }}
        >
          {t('reconnect.returningToLobby')}
        </p>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ['#C29B47', '#E3B45E', '#D97B6C', '#6FC2BB', '#8FA3D9', '#A9C46C', '#FAF6F0'];

function Confetti() {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 36 }, (_, i) => {
        // Deterministic spread — no Math.random in render.
        const x = (i * 53) % 100;
        const k = ((i * 29) % 13) / 12 - 0.5;
        return (
          <span
            key={i}
            className="tg-confetti"
            style={
              {
                position: 'absolute',
                top: 0,
                left: `${x}%`,
                width: 8,
                height: i % 3 === 0 ? 14 : 8,
                borderRadius: i % 2 ? 2 : 999,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                '--dx': `${k * 160}px`,
                '--rot': `${360 + k * 540}deg`,
                '--dur': `${2.2 + ((i * 17) % 10) / 10}s`,
                '--delay': `${((i * 7) % 10) / 20}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function KickedOverlay({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  const t = useT();
  // Same layout as "can't reach the room" (4h) — kicked / room closed / full.
  return <ProblemScreen icon="🚪" title={message} primary={{ label: t('kicked.ok'), run: onClose }} />;
}

export function App() {
  const { player, setPlayer, setRoom, setConnected, reset } = usePlayerStore();
  const { gameId, setGameState, setPlayerData, resetGame } = useGameStore();
  const [gameEndedNotice, setGameEndedNotice] = useState(false);
  const [finalPlacement, setFinalPlacement] = useState<{
    rank: number;
    points: number;
    /** This player's own funny diploma (utešna titula), if any. */
    award: PlayerAward | null;
    /** Everyone's final placement — rendered under the own-rank badge. */
    standings: {
      playerId: string;
      name: string;
      avatarColor: string;
      score: number;
      rank: number;
    }[];
  } | null>(null);
  const [kickNotice, setKickNotice] = useState<string | null>(null);
  const [stoppedEarly, setStoppedEarly] = useState<{
    round: number;
    totalRounds: number;
  } | null>(null);

  // Hold a screen wake lock once the player is in a room — prevents the
  // phone from sleeping mid-round and dropping the WebSocket.
  useWakeLock(!!player);

  // Warm the lazy game chunks while idling in the lobby so game start
  // doesn't stall on a chunk download over a slow phone connection.
  useEffect(() => {
    if (player) prefetchGameComponents();
  }, [player]);

  useEffect(() => {
    socket.connect();
    const unbindKnocks = bindKnockSocket();
    const unbindFlow = bindFlowSocket();

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      // socket.io-client does NOT auto-reconnect when the server forcibly
      // disconnects us (kick, room destroyed, self-leave). Without a
      // manual reconnect, the next join attempt buffers forever and the
      // UI sticks on "Spajanje...". Transient drops (transport close,
      // ping timeout) keep their normal auto-reconnect behavior.
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    socket.on('player:joined', ({ player, room }) => {
      setPlayer(player);
      setRoom(room);
      // Receiving this event means the socket IS connected — sync the flag
      // in case a late server-side disconnect from a prior session landed
      // out of order and left isConnected stuck at false, which would
      // wedge the UI on the reconnecting banner.
      setConnected(true);
    });

    // Upsert a player into the local roster (add if new, replace if present).
    const upsertPlayer = (incoming: PublicPlayer) => {
      usePlayerStore.setState((state) => {
        if (!state.room) return state;
        const exists = state.room.players.some((p) => p.id === incoming.id);
        return {
          room: {
            ...state.room,
            players: exists
              ? state.room.players.map((p) =>
                  p.id === incoming.id ? { ...p, ...incoming } : p
                )
              : [...state.room.players, incoming],
          },
        };
      });
    };

    socket.on('room:player-joined', ({ player: newPlayer }) => {
      upsertPlayer(newPlayer);
    });

    // A returning player (token reconnect or name reclaim). The server now
    // sends the full player, so re-add them even if grace expiry had already
    // dropped them from this roster — without this the remote-host admin
    // couldn't see (or start a game with) someone who rejoined.
    socket.on('room:player-reconnected', ({ playerId, player }) => {
      if (player) upsertPlayer(player);
      else
        usePlayerStore.setState((state) => {
          if (!state.room) return state;
          return {
            room: {
              ...state.room,
              players: state.room.players.map((p) =>
                p.id === playerId ? { ...p, isConnected: true } : p
              ),
            },
          };
        });
    });

    socket.on('room:remote-host-changed', ({ remoteHostPlayerId }) => {
      usePlayerStore.getState().setRemoteHostPlayerId(remoteHostPlayerId);
      const me = usePlayerStore.getState().player;
      if (me && remoteHostPlayerId !== me.id) {
        useNavStore.getState().setScreen('lobby');
      }
    });

    socket.on('room:player-left', ({ playerId }) => {
      usePlayerStore.setState((state) => {
        if (!state.room) return state;
        return {
          room: {
            ...state.room,
            players: state.room.players.map((p) =>
              p.id === playerId ? { ...p, isConnected: false } : p
            ),
          },
        };
      });
    });

    socket.on('room:player-updated', ({ player: updated }) => {
      usePlayerStore.getState().updatePlayerProfile(updated.id, {
        name: updated.name,
        avatarColor: updated.avatarColor,
        avatarEmoji: updated.avatarEmoji,
      });
    });

    socket.on('room:player-removed', ({ playerId }) => {
      usePlayerStore.setState((state) => {
        if (!state.room) return state;
        return {
          room: {
            ...state.room,
            players: state.room.players.filter((p) => p.id !== playerId),
          },
        };
      });
    });

    socket.on('room:chat-message', ({ message }) => {
      usePlayerStore.getState().addChatMessage(message);
    });

    socket.on('room:chat-history', ({ messages }) => {
      usePlayerStore.getState().setChatMessages(messages);
    });

    socket.on('game:started', ({ gameState }) => {
      setGameState(gameState);
      useNavStore.getState().setScreen('lobby');
      usePlayerStore.getState().clearChat();
    });

    socket.on('game:state-update', ({ gameState }) => {
      // The room broadcast carries NO per-player data (playerData is
      // stripped server-side; our slice arrives via game:player-state).
      // Keep the previous playerData instead of clobbering it with the
      // empty object — otherwise every 1s tick momentarily blanks myData,
      // remounting game UIs and wiping their local state (e.g. the geo
      // draft pin).
      const prev = useGameStore.getState().gameState;
      if (prev && prev.gameId === gameState.gameId) {
        setGameState({ ...gameState, playerData: prev.playerData });
      } else {
        setGameState(gameState);
      }
    });

    socket.on('game:player-state', ({ playerData }) => {
      // Carries ONLY our private slice — the shared data arrived just
      // before via the game:state-update broadcast. Merge the slice into
      // the current state instead of expecting a full snapshot.
      const prev = useGameStore.getState().gameState;
      if (!prev) return;
      setGameState({ ...prev, playerData });
      const playerId = usePlayerStore.getState().player?.id;
      if (playerId && playerData[playerId]) {
        setPlayerData(playerData[playerId]);
      }
    });

    socket.on('game:timer', ({ timeRemaining }) => {
      // Lightweight countdown tick — the server skips full state
      // broadcasts when nothing but the clock changed.
      const prev = useGameStore.getState().gameState;
      if (!prev || prev.timeRemaining === timeRemaining) return;
      setGameState({ ...prev, timeRemaining });
    });

    socket.on('game:ops-append', ({ gameId, ops }) => {
      // Incremental drawing ops (draw-guess). Append to the operations
      // array in the shared host data; full snapshots keep replacing it
      // wholesale, so the arrays stay consistent either way.
      const prev = useGameStore.getState().gameState;
      if (!prev || prev.gameId !== gameId) return;
      const host = prev.data.host as { operations?: DrawOp[] } | undefined;
      if (!host) return;
      setGameState({
        ...prev,
        data: {
          ...prev.data,
          host: { ...host, operations: [...(host.operations ?? []), ...ops] },
        },
      });
    });

    socket.on('game:ended', ({ finalScores, awards, stoppedEarly, skipResults }) => {
      // Everyone in the room has now played this game (the server marks the
      // same) — the tutorial's "Preporuka" counts on it.
      {
        const endedId = useGameStore.getState().gameId;
        if (endedId) {
          markSeen(endedId);
          usePlayerStore.setState((state) =>
            state.room
              ? {
                  room: {
                    ...state.room,
                    players: state.room.players.map((p) =>
                      p.playedGames?.includes(endedId)
                        ? p
                        : { ...p, playedGames: [...(p.playedGames ?? []), endedId] }
                    ),
                  },
                }
              : state
          );
        }
      }
      // "Bez rezultata": the host sent everyone straight back to the room.
      if (skipResults) {
        setGameEndedNotice(false);
        setFinalPlacement(null);
        resetGame();
        return;
      }
      setStoppedEarly(stoppedEarly ?? null);
      // Surface a quick "Igra je završena" notice so players (especially
      // when the remote host triggered "Završi igru") see why the game UI
      // is about to vanish, instead of being snapped back to the lobby
      // with no explanation. In TV mode the podium lives on the big screen,
      // so show at least the player's own placement here.
      const myId = usePlayerStore.getState().player?.id;
      const mine = myId
        ? finalScores.find((s) => s.playerId === myId)
        : undefined;
      // Only show a personal placement when the scores actually rank players.
      // Team games (e.g. Tajni agenti) never set per-player scores, so
      // everyone ties at 0 — a "1. mesto" badge for all would be misleading.
      const scoresVary =
        finalScores.length > 0 &&
        finalScores.some((s) => s.score !== finalScores[0].score);
      if (mine && scoresVary) {
        // Some games score inverted (Zavet: fewer "uroci" win) — the registry
        // flag decides the ranking direction.
        const endedGameId = useGameStore.getState().gameId;
        const lowerWins =
          !!endedGameId && !!GAME_DEFINITIONS[endedGameId]?.lowerScoreWins;
        const sorted = [...finalScores].sort((a, b) =>
          lowerWins ? a.score - b.score : b.score - a.score
        );
        // Ties share the higher rank (two players at 1000 are both 1st).
        const rank = sorted.findIndex((s) => s.score === mine.score) + 1;
        // Full standings with names/colors joined from the room roster, so
        // the overlay can show everyone's placement, not just our own.
        const roomPlayers = usePlayerStore.getState().room?.players ?? [];
        const standings = sorted.map((s, i) => {
          const p = roomPlayers.find((rp) => rp.id === s.playerId);
          return {
            playerId: s.playerId,
            name: p?.name ?? '???',
            avatarColor: p?.avatarColor ?? '#666',
            score: s.score,
            rank: sorted.findIndex((x) => x.score === s.score) + 1 || i + 1,
          };
        });
        const myAward = awards?.find((a) => a.playerId === myId) ?? null;
        setFinalPlacement({ rank, points: mine.score, award: myAward, standings });
      } else {
        setFinalPlacement(null);
      }
      setGameEndedNotice(true);
      // With the full standings list there's more to read — hold longer.
      const holdMs = mine && scoresVary ? 7000 : 4000;
      setTimeout(() => {
        setGameEndedNotice(false);
        setFinalPlacement(null);
        resetGame();
      }, holdMs);
    });

    socket.on('room:kicked', ({ reason }) => {
      // Host removed us from the room — clear the reconnect token so we
      // don't try to silently rejoin, drop game state, and bounce back
      // to the join screen. The follow-up disconnect from the server
      // triggers the manual reconnect in the disconnect handler above.
      // The reason renders as an in-app overlay (never a blocking
      // alert(), which froze the event loop and raced the reconnect).
      resetGame();
      reset();
      useNavStore.getState().setScreen('lobby');
      if (reason) setKickNotice(reason);
    });

    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
      // Read the live store — this handler is registered once at mount, so
      // the captured `player` is stale (null then) and would wrongly reset
      // an in-room player on any server error (e.g. a rejected profile edit).
      if (!usePlayerStore.getState().player) reset();
    });

    return () => {
      unbindKnocks();
      unbindFlow();
      socket.off('connect');
      socket.off('disconnect');
      socket.off('player:joined');
      socket.off('room:player-joined');
      socket.off('room:player-reconnected');
      socket.off('room:player-left');
      socket.off('room:player-removed');
      socket.off('room:player-updated');
      socket.off('room:remote-host-changed');
      socket.off('room:chat-message');
      socket.off('room:chat-history');
      socket.off('game:started');
      socket.off('game:state-update');
      socket.off('game:player-state');
      socket.off('game:timer');
      socket.off('game:ops-append');
      socket.off('game:ended');
      socket.off('room:kicked');
      socket.off('error');
    };
  }, []);

  const screen = useNavStore((s) => s.screen);

  let body: React.ReactNode;
  if (!player) {
    body = <JoinScreen />;
  } else if (gameId) {
    body = <GameScreen />;
  } else if (screen === 'game-select') {
    body = <GameSelectScreen />;
  } else {
    body = <LobbyScreen />;
  }

  return (
    <>
      <BackButtonGuard />
      {body}
      {/* Chat only works while the room is in the lobby (server-enforced), so
          the head floats over the lobby + game-select screens and unmounts
          during games. */}
      {player && !gameId && <ChatHead showBubble={screen !== 'lobby'} />}
      {/* Pokucaj — only the remote-host holder ever has guests at the door. */}
      {player && <KnockBanner />}
      {/* Drops stay in place: banner + dim, then a retry screen (4g/4h). */}
      <ConnectionStatus />
      <RulesScreen />
      {gameEndedNotice && (
        <GameEndedOverlay placement={finalPlacement} stoppedEarly={stoppedEarly} />
      )}
      {kickNotice && (
        <KickedOverlay message={kickNotice} onClose={() => setKickNotice(null)} />
      )}
    </>
  );
}
