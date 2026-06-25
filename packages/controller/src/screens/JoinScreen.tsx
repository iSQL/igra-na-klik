import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n/useT';

const SINGLE_ROOM_MODE = import.meta.env.VITE_SINGLE_ROOM === 'true';

export function JoinScreen() {
  const reconnectToken = usePlayerStore((s) => s.reconnectToken);
  const t = useT();

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

  useEffect(() => {
    // Reset the "Spajanje..." button state on any server response. On
    // success the App.tsx player:joined handler unmounts this screen so
    // we never see the false→true→false flicker; on error the message
    // surfaces here and the button becomes clickable again.
    const onJoined = () => setJoining(false);
    const onError = ({ message }: { message: string }) => {
      setJoining(false);
      setError(message);
      // The most common cause of failure for a returning player is a
      // stale reconnect token (their previous slot was removed after
      // grace expiry). Clear it so the next attempt is a clean fresh
      // join, not another doomed reconnect.
      usePlayerStore.getState().reset();
    };
    socket.on('player:joined', onJoined);
    socket.on('error', onError);
    return () => {
      socket.off('player:joined', onJoined);
      socket.off('error', onError);
    };
  }, []);

  const handleJoin = () => {
    const codeLength = roomCode.length;
    if (codeLength === 0) {
      setError(t('join.roomNotOpen'));
      return;
    }
    if (!playerName.trim()) {
      setError(t('join.enterName'));
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
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <LanguageSwitch />
      </div>

      <h1 style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 700 }}>
        {t('common.appName')}
      </h1>

      {!SINGLE_ROOM_MODE && (
        <input
          type="text"
          placeholder={t('join.roomCode')}
          maxLength={2}
          autoFocus={!roomCode}
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
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
        placeholder={t('join.yourName')}
        maxLength={20}
        autoFocus={SINGLE_ROOM_MODE || !!roomCode}
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
        {joining ? t('join.joining') : t('join.enterGame')}
      </button>

      <a
        href="/"
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          textAlign: 'center',
          marginTop: '-0.5rem',
          opacity: 0.7,
        }}
      >
        {t('join.home')}
      </a>
    </div>
  );
}
