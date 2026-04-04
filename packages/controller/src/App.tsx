import { useEffect } from 'react';
import { socket } from './socket';
import { usePlayerStore } from './store/playerStore';
import { useGameStore } from './store/gameStore';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';

export function App() {
  const { player, setPlayer, setRoom, setConnected, reset } = usePlayerStore();
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
      socket.off('game:started');
      socket.off('game:state-update');
      socket.off('game:player-state');
      socket.off('game:ended');
      socket.off('error');
    };
  }, []);

  if (!player) return <JoinScreen />;
  if (gameId) return <GameScreen />;
  return <LobbyScreen />;
}
