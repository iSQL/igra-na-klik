import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';

const SINGLE_ROOM_MODE = import.meta.env.VITE_SINGLE_ROOM === 'true';

export function JoinScreen() {
  const reconnectToken = usePlayerStore((s) => s.reconnectToken);

  const params = new URLSearchParams(window.location.search);
  const [roomCode, setRoomCode] = useState(params.get('code') || '');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [fetchingCode, setFetchingCode] = useState(false);

  useEffect(() => {
    if (!SINGLE_ROOM_MODE || params.get('code')) return;
    setFetchingCode(true);
    fetch('/room-code')
      .then((r) => r.json())
      .then((data: { roomCode: string | null }) => {
        if (data.roomCode) setRoomCode(data.roomCode);
      })
      .catch(() => {})
      .finally(() => setFetchingCode(false));
  }, []);

  const handleJoin = () => {
    const codeLength = roomCode.length;
    if (codeLength === 0) {
      setError('Soba još nije otvorena. Pričekaj host.');
      return;
    }
    if (!playerName.trim()) {
      setError('Upiši svoje ime');
      return;
    }

    setError('');
    setJoining(true);

    socket.emit('player:join-room', {
      roomCode: roomCode.toUpperCase(),
      playerName: playerName.trim(),
      reconnectToken: reconnectToken || undefined,
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        width: '100%',
        maxWidth: '400px',
      }}
    >
      <h1 style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 700 }}>
        Igra Na Klik
      </h1>

      {!SINGLE_ROOM_MODE && (
        <input
          type="text"
          placeholder="Room Code"
          maxLength={4}
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          style={{
            padding: '0.75rem 1rem',
            fontSize: '2rem',
            textAlign: 'center',
            letterSpacing: '0.5rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '2px solid var(--bg-card)',
            borderRadius: '0.75rem',
          }}
        />
      )}

      {SINGLE_ROOM_MODE && (
        <div
          style={{
            textAlign: 'center',
            fontSize: '2rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.5rem',
            color: fetchingCode ? 'var(--text-secondary)' : 'var(--accent)',
            padding: '0.75rem',
            background: 'var(--bg-secondary)',
            borderRadius: '0.75rem',
            minHeight: '4rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {fetchingCode ? '...' : roomCode || '—'}
        </div>
      )}

      <input
        type="text"
        placeholder="Tvoje ime"
        maxLength={20}
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        style={{
          padding: '0.75rem 1rem',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '2px solid var(--bg-card)',
          borderRadius: '0.75rem',
        }}
      />

      {error && (
        <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
      )}

      <button
        onClick={handleJoin}
        disabled={joining || fetchingCode}
        style={{
          padding: '1rem',
          fontSize: '1.3rem',
          fontWeight: 700,
          borderRadius: '0.75rem',
          background: 'var(--accent)',
          color: '#fff',
        }}
      >
        {joining ? 'Spajanje...' : 'Uđi u igru'}
      </button>
    </div>
  );
}
