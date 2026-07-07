import { useEffect, useState } from 'react';
import type { DrawOp } from '@igra/shared';
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
import { useT } from './i18n/useT';

function ReconnectingOverlay() {
  const t = useT();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11, 10, 23, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1.5rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <span
          style={{
            display: 'inline-block',
            width: '44px',
            height: '44px',
            border: '4px solid var(--amber)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'igra-spin .8s linear infinite',
            marginBottom: '1.2rem',
          }}
        />
        <p
          className="display"
          style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--amber)' }}
        >
          {t('reconnect.reconnecting')}
        </p>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontWeight: 700 }}>
          {t('reconnect.wait')}
        </p>
      </div>
    </div>
  );
}

function GameEndedOverlay({
  placement,
}: {
  placement: { rank: number; points: number } | null;
}) {
  const t = useT();
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
      <div style={{ textAlign: 'center', animation: 'igra-pop .5s' }}>
        <p className="display" style={{ fontSize: '2rem', fontWeight: 700 }}>
          {t('reconnect.gameEnded')}
        </p>
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

function KickedOverlay({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(180deg, #1a0d12, var(--bg-primary))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '2rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '340px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.4rem',
        }}
      >
        <div
          style={{
            width: '96px',
            height: '96px',
            borderRadius: '50%',
            background: 'rgba(255,77,94,.14)',
            border: '1px solid rgba(255,77,94,.4)',
            display: 'grid',
            placeItems: 'center',
            fontSize: '2.6rem',
          }}
        >
          🚪
        </div>
        <p
          className="display"
          style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}
        >
          {message}
        </p>
        <button className="btn-primary" onClick={onClose} style={{ width: '100%' }}>
          {t('kicked.ok')}
        </button>
      </div>
    </div>
  );
}

export function App() {
  const { player, isConnected, setPlayer, setRoom, setConnected, reset } =
    usePlayerStore();
  const { gameId, setGameState, setPlayerData, resetGame } = useGameStore();
  const [gameEndedNotice, setGameEndedNotice] = useState(false);
  const [finalPlacement, setFinalPlacement] = useState<{
    rank: number;
    points: number;
  } | null>(null);
  const [kickNotice, setKickNotice] = useState<string | null>(null);

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
      // wedge the UI on the "Reconnecting" overlay.
      setConnected(true);
    });

    socket.on('room:player-joined', ({ player: newPlayer }) => {
      usePlayerStore.setState((state) => {
        if (!state.room) return state;
        return {
          room: {
            ...state.room,
            players: [...state.room.players, newPlayer],
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
      usePlayerStore
        .getState()
        .updatePlayerAvatar(updated.id, updated.avatarColor, updated.avatarEmoji);
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

    socket.on('game:ended', ({ finalScores }) => {
      // Surface a quick "Igra je završena" notice so players (especially
      // when the remote host triggered "Završi igru") see why the game UI
      // is about to vanish, instead of being snapped back to the lobby
      // with no explanation. In TV mode the podium lives on the big screen,
      // so show at least the player's own placement here.
      const myId = usePlayerStore.getState().player?.id;
      const mine = myId
        ? finalScores.find((s) => s.playerId === myId)
        : undefined;
      if (mine) {
        const sorted = [...finalScores].sort((a, b) => b.score - a.score);
        // Ties share the higher rank (two players at 1000 are both 1st).
        const rank = sorted.findIndex((s) => s.score === mine.score) + 1;
        setFinalPlacement({ rank, points: mine.score });
      } else {
        setFinalPlacement(null);
      }
      setGameEndedNotice(true);
      setTimeout(() => {
        setGameEndedNotice(false);
        setFinalPlacement(null);
        resetGame();
      }, 4000);
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
      if (!player) reset();
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('player:joined');
      socket.off('room:player-joined');
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

  // Show reconnecting overlay when disconnected but player exists
  const showReconnecting = player && !isConnected;
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
      {showReconnecting && <ReconnectingOverlay />}
      {body}
      {gameEndedNotice && <GameEndedOverlay placement={finalPlacement} />}
      {kickNotice && (
        <KickedOverlay message={kickNotice} onClose={() => setKickNotice(null)} />
      )}
    </>
  );
}
