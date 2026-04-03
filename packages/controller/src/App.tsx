import { useEffect } from 'react';
import { socket } from './socket';
import { usePlayerStore } from './store/playerStore';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';

export function App() {
  const { player, setPlayer, setRoom, setConnected, reset } = usePlayerStore();

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

    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
      reset();
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('player:joined');
      socket.off('room:player-joined');
      socket.off('room:player-left');
      socket.off('error');
    };
  }, []);

  if (!player) return <JoinScreen />;
  return <LobbyScreen />;
}
