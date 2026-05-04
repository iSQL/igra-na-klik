import { useEffect } from 'react';
import { socket } from './socket';
import { usePlayerStore } from './store/playerStore';
import { useGameStore } from './store/gameStore';
import { useNavStore } from './store/navStore';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameSelectScreen } from './screens/GameSelectScreen';
import { GameScreen } from './screens/GameScreen';

function ReconnectingOverlay() {
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
        <p style={{ fontSize: '1.3rem', fontWeight: 600 }}>Reconnecting...</p>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Please wait
        </p>
      </div>
    </div>
  );
}

export function App() {
  const { player, isConnected, setPlayer, setRoom, setConnected, reset } =
    usePlayerStore();
  const { gameId, setGameState, setPlayerData, resetGame } = useGameStore();

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('player:joined', ({ player, room }) => {
      setPlayer(player);
      setRoom(room);
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

    socket.on('game:started', ({ gameState }) => {
      setGameState(gameState);
      useNavStore.getState().setScreen('lobby');
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
      setTimeout(() => {
        resetGame();
      }, 3000);
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
      socket.off('room:remote-host-changed');
      socket.off('game:started');
      socket.off('game:state-update');
      socket.off('game:player-state');
      socket.off('game:ended');
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
    </>
  );
}
