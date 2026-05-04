import { useEffect } from 'react';
import { socket } from './socket';
import { useRoomStore } from './store/roomStore';
import { useGameStore } from './store/gameStore';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameSelectScreen } from './screens/GameSelectScreen';
import { GameScreen } from './screens/GameScreen';

export function App() {
  const {
    status,
    setRoom,
    addPlayer,
    setPlayerConnected,
    setStatus,
    setRemoteHostPlayerId,
  } = useRoomStore();
  const { setGameState, resetGame } = useGameStore();

  useEffect(() => {
    socket.connect();

    socket.on('host:room-created', ({ room }) => {
      setRoom(room);
      setStatus('lobby');
      window.history.replaceState(null, '', `?code=${room.code}`);
    });

    socket.on('room:player-joined', ({ player }) => {
      addPlayer(player);
    });

    socket.on('room:player-left', ({ playerId }) => {
      setPlayerConnected(playerId, false);
    });

    socket.on('room:player-reconnected', ({ playerId }) => {
      setPlayerConnected(playerId, true);
    });

    socket.on('room:remote-host-changed', ({ remoteHostPlayerId }) => {
      setRemoteHostPlayerId(remoteHostPlayerId);
    });

    socket.on('game:started', ({ gameState }) => {
      setGameState(gameState);
      setStatus('in-game');
    });

    socket.on('game:state-update', ({ gameState }) => {
      setGameState(gameState);
    });

    socket.on('game:ended', () => {
      setTimeout(() => {
        resetGame();
        setStatus('lobby');
      }, 3000);
    });

    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
    });

    socket.on('connect', () => {
      if (status === 'disconnected') {
        socket.emit('host:create-room', {});
        setStatus('creating');
      }
    });

    return () => {
      socket.off('host:room-created');
      socket.off('room:player-joined');
      socket.off('room:player-left');
      socket.off('room:player-reconnected');
      socket.off('room:remote-host-changed');
      socket.off('game:started');
      socket.off('game:state-update');
      socket.off('game:ended');
      socket.off('error');
      socket.off('connect');
    };
  }, []);

  return (
    <>
      {status === 'disconnected' && (
        <p style={{ fontSize: '1.5rem' }}>Connecting...</p>
      )}
      {status === 'creating' && (
        <p style={{ fontSize: '1.5rem' }}>Creating room...</p>
      )}
      {status === 'lobby' && <LobbyScreen />}
      {status === 'game-select' && <GameSelectScreen />}
      {status === 'in-game' && <GameScreen />}
    </>
  );
}
