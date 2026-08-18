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

// autoFocus is a convenience for the FIRST open only (fresh app launch,
// possibly via a ?code= deep link). When the player lands back here later —
// room closed, kicked, voluntary leave — auto-popping the phone keyboard is
// jarring, so remounts after the first skip it. Module-level on purpose:
// survives JoinScreen unmount/remount within the same page load.
let hadFirstMount = false;

// Faces shown per room row before the rest collapse into a +N chip — more
// than three and the row's code, count and join pill start fighting for
// width on a narrow phone.
const MAX_ROOM_FACES = 3;

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
  // Read the latch during render (autoFocus applies at initial render), but
  // only SET it in an effect — keeps render pure so StrictMode's double
  // render can't consume the first-mount slot before the real paint.
  const allowAutoFocus = !hadFirstMount;
  useEffect(() => {
    hadFirstMount = true;
  }, []);

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

  const roomFaceStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    flexShrink: 0,
    borderRadius: '50%',
    // Cut out of the row background so overlapping faces stay separable.
    border: '2px solid var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            fontWeight: 700,
            fontSize: '1.4rem',
          }}
        >
          {/* Reverse cut — the join screen canvas is navy. */}
          <img
            src={`${import.meta.env.BASE_URL}ink-mark-reverse.svg`}
            alt=""
            width={34}
            height={34}
          />
          {/* One flex item, or the row gap would open up inside the wordmark. */}
          <span>
            igra na <span className="text-grad">KLIK</span>
          </span>
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
            autoFocus={allowAutoFocus && !roomCode}
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
          autoFocus={allowAutoFocus && (SINGLE_ROOM_MODE || !!roomCode)}
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
                        padding: '0.65rem 0.7rem 0.65rem 0.8rem',
                        borderRadius: '14px',
                        background: 'var(--bg-secondary)',
                        // A joinable room is the one thing on this screen you
                        // can act on without typing — give it the gold edge.
                        border: joinable
                          ? '1.5px solid var(--accent)'
                          : '1px solid var(--line2)',
                        boxShadow: joinable
                          ? '0 6px 18px rgba(194,155,71,.18)'
                          : 'none',
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
                          display: 'flex',
                          alignItems: 'center',
                          minWidth: 0,
                        }}
                      >
                        {r.avatars.slice(0, MAX_ROOM_FACES).map((a, i) => (
                          <span
                            key={i}
                            aria-hidden
                            style={{ ...roomFaceStyle, background: a.color, marginLeft: i === 0 ? 0 : '-7px' }}
                          >
                            {a.emoji}
                          </span>
                        ))}
                        {r.playerCount > MAX_ROOM_FACES && (
                          <span
                            aria-hidden
                            style={{
                              ...roomFaceStyle,
                              marginLeft: '-7px',
                              background: 'var(--bg-card)',
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            +{r.playerCount - MAX_ROOM_FACES}
                          </span>
                        )}
                        <span
                          style={{
                            marginLeft: r.avatars.length ? '0.5rem' : 0,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {r.playerCount}/{r.maxPlayers}
                        </span>
                      </span>
                      {r.status !== 'lobby' ? (
                        <span style={roomBadgeStyle}>{t('join.inGame')}</span>
                      ) : joinable ? (
                        <span
                          style={{
                            padding: '0.35rem 0.7rem',
                            borderRadius: '999px',
                            background: 'var(--accent)',
                            color: 'var(--bg-primary)',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t('join.enterShort')}
                        </span>
                      ) : (
                        <span style={roomBadgeStyle}>{t('join.full')}</span>
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
