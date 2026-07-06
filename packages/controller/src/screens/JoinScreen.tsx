import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n/useT';

const SINGLE_ROOM_MODE = import.meta.env.VITE_SINGLE_ROOM === 'true';
// Last name used to enter a room — returning players get it pre-filled so
// rejoining is one tap (and name-based slot reclaim just works).
const LAST_NAME_KEY = 'igra-player-name';

// Server join errors are fixed English strings — map the known ones to
// localized, friendlier messages (the raw text still shows for unknowns).
const SERVER_ERROR_KEYS: Record<string, string> = {
  'Game already in progress': 'join.gameInProgress',
  'Room not found': 'join.roomNotFound',
  'Name already taken': 'join.nameTaken',
  'Room is full': 'join.roomFull',
};

export function JoinScreen() {
  const reconnectToken = usePlayerStore((s) => s.reconnectToken);
  const t = useT();

  const params = new URLSearchParams(window.location.search);
  const [roomCode, setRoomCode] = useState(params.get('code') || '');
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem(LAST_NAME_KEY) ?? ''
  );
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fetchingCode, setFetchingCode] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    const onJoined = () => {
      setJoining(false);
      setCreating(false);
    };
    const onError = ({ message }: { message: string }) => {
      setJoining(false);
      setCreating(false);
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

  // Optional override lets the room-code input auto-join on the keystroke
  // that completes the code, before React state has caught up.
  const handleJoin = (codeOverride?: string) => {
    const code = (codeOverride ?? roomCode).trim();
    if (code.length === 0) {
      setError(t('join.roomNotOpen'));
      return;
    }
    const name = playerName.trim();
    if (!name) {
      setError(t('join.enterName'));
      return;
    }

    setError('');
    setJoining(true);
    localStorage.setItem(LAST_NAME_KEY, name);

    socket.emit('player:join-room', {
      roomCode: code.toUpperCase(),
      playerName: name,
      reconnectToken: reconnectToken || undefined,
    });
  };

  const handleCodeChange = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, '');
    setRoomCode(cleaned);
    if (cleaned.length !== 2 || joining || creating) return;
    // Code just completed: join right away if the name is ready, otherwise
    // hop the focus over so the player types their name next.
    if (playerName.trim()) {
      handleJoin(cleaned);
    } else {
      nameInputRef.current?.focus();
    }
  };

  const handleCreate = () => {
    const name = playerName.trim();
    if (!name) {
      setError(t('join.enterName'));
      return;
    }
    setError('');
    setCreating(true);
    localStorage.setItem(LAST_NAME_KEY, name);
    socket.emit('player:create-room', { playerName: name });
  };

  const errorKey = SERVER_ERROR_KEYS[error];
  const displayError = errorKey ? t(errorKey) : error;

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
          onChange={(e) => handleCodeChange(e.target.value)}
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
        ref={nameInputRef}
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
        <p style={{ color: 'var(--danger)', textAlign: 'center' }}>
          {displayError}
        </p>
      )}

      <button
        onClick={() => handleJoin()}
        disabled={joining || creating || fetchingCode}
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

      {!SINGLE_ROOM_MODE && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'var(--bg-card)' }} />
            {t('join.or')}
            <span style={{ flex: 1, height: 1, background: 'var(--bg-card)' }} />
          </div>

          <button
            onClick={handleCreate}
            disabled={joining || creating}
            style={{
              padding: '0.85rem',
              fontSize: '1.05rem',
              fontWeight: 700,
              borderRadius: '0.75rem',
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '2px solid var(--accent)',
            }}
          >
            {creating ? t('join.creating') : t('join.createRoom')}
          </button>
          <p
            style={{
              margin: 0,
              marginTop: '-0.75rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              textAlign: 'center',
            }}
          >
            {t('join.createRoomHint')}
          </p>
        </>
      )}

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
