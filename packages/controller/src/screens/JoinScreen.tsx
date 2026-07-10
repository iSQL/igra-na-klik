import { useState, useEffect, useRef } from 'react';
import { ROOM_CODE_LENGTH, type RoomSummary } from '@igra/shared';
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
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Public list of active rooms (same feed the landing page uses). Only in
  // multi-room mode; single-room already auto-fills the one room's code.
  useEffect(() => {
    if (SINGLE_ROOM_MODE) return;
    let alive = true;
    const load = () => {
      fetch('/api/rooms')
        .then((r) => r.json())
        .then((data: { rooms?: RoomSummary[] }) => {
          if (alive) setRooms(data.rooms ?? []);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

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
    if (cleaned.length !== ROOM_CODE_LENGTH || joining || creating) return;
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

  // Tapping a room in the list fills its code, then joins if the name is
  // ready or hops focus to the name field otherwise (same as typing a code).
  const pickRoom = (code: string) => {
    setError('');
    setRoomCode(code);
    if (playerName.trim()) handleJoin(code);
    else nameInputRef.current?.focus();
  };

  const errorKey = SERVER_ERROR_KEYS[error];
  const displayError = errorKey ? t(errorKey) : error;

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    color: 'var(--text-secondary)',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  };

  const roomBadgeStyle: React.CSSProperties = {
    fontSize: '0.65rem',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--amber)',
    background: 'rgba(227,180,94,.14)',
    padding: '3px 8px',
    borderRadius: '7px',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
        width: '100%',
        maxWidth: '400px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          className="display"
          style={{ fontWeight: 700, fontSize: '1.4rem' }}
        >
          igra na <span className="text-grad">KLIK</span>
        </span>
        <LanguageSwitch />
      </div>

      <div>
        <h2
          className="display"
          style={{ fontSize: '1.9rem', lineHeight: 1, margin: '0 0 0.3rem' }}
        >
          {t('join.enterGame')}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
          {t('join.createRoomHint')}
        </p>
      </div>

      {!SINGLE_ROOM_MODE && (
        <div>
          <label style={labelStyle}>{t('join.roomCode')}</label>
          <input
            type="text"
            maxLength={ROOM_CODE_LENGTH}
            autoFocus={!roomCode}
            value={roomCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            style={{
              marginTop: '0.5rem',
              width: '100%',
              height: '70px',
              fontSize: '2.3rem',
              textAlign: 'center',
              letterSpacing: '0.6rem',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: roomCode.length === ROOM_CODE_LENGTH ? '2px solid var(--pink)' : '2px solid var(--line2)',
              boxShadow: roomCode.length === ROOM_CODE_LENGTH ? '0 0 0 4px rgba(217,123,108,.15)' : 'none',
              borderRadius: '16px',
            }}
          />
        </div>
      )}

      {SINGLE_ROOM_MODE && (
        <div>
          <label style={labelStyle}>{t('join.roomCode')}</label>
          <div
            style={{
              marginTop: '0.5rem',
              textAlign: 'center',
              fontSize: '2.3rem',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              letterSpacing: '0.6rem',
              color: fetchingCode ? 'var(--text-secondary)' : 'var(--text-primary)',
              height: '70px',
              background: 'var(--bg-secondary)',
              border: '2px solid var(--line2)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {fetchingCode ? '...' : roomCode || '—'}
          </div>
        </div>
      )}

      <div>
        <label style={labelStyle}>{t('join.yourName')}</label>
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
            marginTop: '0.5rem',
            width: '100%',
            height: '54px',
            padding: '0 1rem',
            fontWeight: 700,
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1.5px solid var(--line2)',
            borderRadius: '14px',
          }}
        />
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', textAlign: 'center', fontWeight: 700 }}>
          {displayError}
        </p>
      )}

      <button
        className="btn-primary"
        onClick={() => handleJoin()}
        disabled={joining || creating || fetchingCode}
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
              color: 'var(--dim)',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            {t('join.or')}
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          <button
            className="btn-ghost"
            onClick={handleCreate}
            disabled={joining || creating}
          >
            ＋ {creating ? t('join.creating') : t('join.createRoom')}
          </button>

          {rooms.length > 0 && (
            <div>
              <label style={labelStyle}>{t('join.activeRooms')}</label>
              <div
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                }}
              >
                {rooms.map((r) => {
                  const joinable =
                    r.status === 'lobby' && r.playerCount < r.maxPlayers;
                  return (
                    <button
                      key={r.code}
                      onClick={() => pickRoom(r.code)}
                      disabled={!joinable || joining || creating}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.7rem',
                        width: '100%',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '14px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--line2)',
                        opacity: joinable ? 1 : 0.55,
                        textAlign: 'left',
                      }}
                    >
                      <span
                        className="display"
                        style={{
                          fontSize: '1.3rem',
                          fontWeight: 700,
                          letterSpacing: '0.15em',
                          color: joinable ? 'var(--text-primary)' : 'var(--text-secondary)',
                          minWidth: `${ROOM_CODE_LENGTH + 1}ch`,
                        }}
                      >
                        {r.code}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        👤 {r.playerCount}/{r.maxPlayers}
                      </span>
                      {r.status !== 'lobby' ? (
                        <span style={roomBadgeStyle}>{t('join.inGame')}</span>
                      ) : (
                        !joinable && <span style={roomBadgeStyle}>{t('join.full')}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <a
        href="/"
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          fontWeight: 700,
          textDecoration: 'none',
          textAlign: 'center',
          opacity: 0.8,
        }}
      >
        {t('join.home')}
      </a>
    </div>
  );
}
