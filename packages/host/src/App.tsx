import { useEffect } from 'react';
import { socket } from './socket';
import { useRoomStore } from './store/roomStore';
import { LobbyScreen } from './screens/LobbyScreen';

export function App() {
  const { status, setRoom, addPlayer, removePlayer, setPlayerConnected, setStatus } =
    useRoomStore();

  useEffect(() => {
    socket.connect();

    socket.on('host:room-created', ({ room }) => {
      setRoom(room);
      setStatus('lobby');
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

    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
    });

    // Auto-create room on connect
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
      {(status === 'lobby' || status === 'game-select') && <LobbyScreen />}
    </>
  );
}
