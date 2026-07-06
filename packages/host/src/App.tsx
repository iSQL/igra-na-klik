import { useEffect } from 'react';
import type { DrawOp } from '@igra/shared';
import { socket } from './socket';
import { useRoomStore } from './store/roomStore';
import { useGameStore } from './store/gameStore';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameSelectScreen } from './screens/GameSelectScreen';
import { GameScreen } from './screens/GameScreen';
import { prefetchGameComponents } from './games/registry';
import { useT } from './i18n/useT';

export function App() {
  const t = useT();
  const {
    status,
    setRoom,
    addPlayer,
    removePlayer,
    setPlayerConnected,
    updatePlayer,
    setStatus,
    setRemoteHostPlayerId,
    addChatMessage,
    setChatMessages,
    clearChat,
    reset: resetRoom,
  } = useRoomStore();
  const { setGameState, resetGame } = useGameStore();

  // Warm the lazy game chunks once the room is up so starting a game
  // doesn't stall on a chunk download.
  useEffect(() => {
    if (status === 'lobby') prefetchGameComponents();
  }, [status]);

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

    socket.on('room:player-removed', ({ playerId }) => {
      removePlayer(playerId);
    });

    socket.on('room:player-reconnected', ({ playerId }) => {
      setPlayerConnected(playerId, true);
    });

    socket.on('room:player-updated', ({ player }) => {
      updatePlayer(player);
    });

    socket.on('room:remote-host-changed', ({ remoteHostPlayerId }) => {
      setRemoteHostPlayerId(remoteHostPlayerId);
    });

    socket.on('room:chat-message', ({ message }) => {
      addChatMessage(message);
    });

    socket.on('room:chat-history', ({ messages }) => {
      setChatMessages(messages);
    });

    socket.on('game:started', ({ gameState }) => {
      setGameState(gameState);
      setStatus('in-game');
      clearChat();
    });

    socket.on('game:state-update', ({ gameState }) => {
      setGameState(gameState);
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

    socket.on('game:ended', () => {
      setTimeout(() => {
        resetGame();
        setStatus('lobby');
      }, 3000);
    });

    socket.on('room:destroyed', () => {
      const selfClosed = useRoomStore.getState().selfClosed;
      resetGame();
      resetRoom();
      window.history.replaceState(null, '', window.location.pathname);

      if (selfClosed) {
        // This TV explicitly closed its own room — leave the host app and
        // land on the public landing page.
        window.location.href = '/';
        return;
      }

      // A remote-host player tore the room down; spin up a fresh room so
      // the TV is immediately ready for a new session instead of stranded
      // on an empty lobby.
      socket.emit('host:create-room', {});
      setStatus('creating');
    });

    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
    });

    socket.on('connect', () => {
      // Read live status (the closure value is stale after mount) so a
      // reconnect while on the "closed" screen doesn't spawn a new room.
      if (useRoomStore.getState().status === 'disconnected') {
        socket.emit('host:create-room', {});
        setStatus('creating');
      }
    });

    return () => {
      socket.off('host:room-created');
      socket.off('room:player-joined');
      socket.off('room:player-left');
      socket.off('room:player-removed');
      socket.off('room:player-reconnected');
      socket.off('room:player-updated');
      socket.off('room:remote-host-changed');
      socket.off('room:chat-message');
      socket.off('room:chat-history');
      socket.off('game:started');
      socket.off('game:state-update');
      socket.off('game:timer');
      socket.off('game:ops-append');
      socket.off('game:ended');
      socket.off('room:destroyed');
      socket.off('error');
      socket.off('connect');
    };
  }, []);

  return (
    <>
      {status === 'disconnected' && (
        <p style={{ fontSize: '1.5rem' }}>{t('app.connecting')}</p>
      )}
      {status === 'creating' && (
        <p style={{ fontSize: '1.5rem' }}>{t('app.creatingRoom')}</p>
      )}
      {status === 'lobby' && <LobbyScreen />}
      {status === 'game-select' && <GameSelectScreen />}
      {status === 'in-game' && <GameScreen />}
    </>
  );
}
