import { useEffect, useState } from 'react';
import { socket } from './socket';
import { usePlayerStore } from './store/playerStore';
import { useGameStore } from './store/gameStore';
import { useNavStore } from './store/navStore';
import { useWakeLock } from './hooks/useWakeLock';
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
        background: 'rgba(15, 15, 35, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '1.3rem', fontWeight: 600 }}>{t('reconnect.reconnecting')}</p>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          {t('reconnect.wait')}
        </p>
      </div>
    </div>
  );
}

function GameEndedOverlay() {
  const t = useT();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 15, 35, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 900,
        padding: '1.5rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '1.6rem', fontWeight: 700 }}>{t('reconnect.gameEnded')}</p>
        <p
          style={{
            color: 'var(--text-secondary)',
            marginTop: '0.6rem',
            fontSize: '1rem',
          }}
        >
          {t('reconnect.returningToLobby')}
        </p>
      </div>
    </div>
  );
}

export function App() {
  const { player, isConnected, setPlayer, setRoom, setConnected, reset } =
    usePlayerStore();
  const { gameId, setGameState, setPlayerData, resetGame } = useGameStore();
  const [gameEndedNotice, setGameEndedNotice] = useState(false);

  // Hold a screen wake lock once the player is in a room — prevents the
  // phone from sleeping mid-round and dropping the WebSocket.
  useWakeLock(!!player);

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
      setGameState(gameState);
    });

    socket.on('game:player-state', ({ gameState }) => {
      setGameState(gameState);
      const playerId = usePlayerStore.getState().player?.id;
      if (playerId && gameState.playerData[playerId]) {
        setPlayerData(gameState.playerData[playerId]);
      }
    });

    socket.on('game:ended', () => {
      // Surface a quick "Igra je završena" notice so players (especially
      // when the remote host triggered "Završi igru") see why the game UI
      // is about to vanish, instead of being snapped back to the lobby
      // with no explanation.
      setGameEndedNotice(true);
      setTimeout(() => {
        setGameEndedNotice(false);
        resetGame();
      }, 3000);
    });

    socket.on('room:kicked', ({ reason }) => {
      // Host removed us from the room — clear the reconnect token so we
      // don't try to silently rejoin, drop game state, and bounce back
      // to the join screen. The follow-up disconnect from the server
      // triggers the manual reconnect in the disconnect handler above.
      resetGame();
      reset();
      useNavStore.getState().setScreen('lobby');
      // Defer the alert so it doesn't block the event loop — otherwise
      // the queued 'disconnect' event sits behind the modal and the
      // manual reconnect ends up racing whatever the user does next.
      if (reason) setTimeout(() => alert(reason), 0);
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
      {gameEndedNotice && <GameEndedOverlay />}
    </>
  );
}
