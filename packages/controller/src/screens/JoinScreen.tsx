import { useState, useEffect, useRef } from 'react';
import { ROOM_CODE_LENGTH, type RoomSummary } from '@igra/shared';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { StartMenu } from '../components/StartMenu';
import { KnockWaitingSheet } from '../components/KnockWaitingSheet';
import { useKnockStore } from '../store/knockStore';
import { useT } from '../i18n/useT';
import { readSeen } from '../components/FirstTimeHint';

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
  const [codeFocused, setCodeFocused] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const knock = useKnockStore((s) => s.knock);
  const knockStatus = useKnockStore((s) => s.status);
  const knockClosed = useKnockStore((s) => s.closed);
  const knockRetryAt = useKnockStore((s) => s.retryAt);
  // Ticks once a second while a "Pokucaj (59s)" countdown is showing.
  const [now, setNow] = useState(() => Date.now());
  const cooling = Object.values(knockRetryAt).some((t) => t > now);
  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooling]);
  // A fresh decline arrives with a new retryAt — sync the clock to it.
  useEffect(() => setNow(Date.now()), [knockRetryAt]);
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
      playedGames: readSeen(),
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
    socket.emit('player:create-room', { playerName: name, playedGames: readSeen() });
  };

  // Tapping a room in the list fills its code, then joins if the name is
  // ready or hops focus to the name field otherwise (same as typing a code).
  const pickRoom = (code: string) => {
    setError('');
    setRoomCode(code);
    if (playerName.trim()) handleJoin(code);
    else nameInputRef.current?.focus();
  };

  // Pokucaj on a room whose game is running. Needs the name first, like a
  // normal join; the seat comes later, on the holder's yes.
  const knockOn = (code: string) => {
    const name = playerName.trim();
    if (!name) {
      setError(t('join.enterName'));
      nameInputRef.current?.focus();
      return;
    }
    setError('');
    localStorage.setItem(LAST_NAME_KEY, name);
    knock(code, name);
  };

  // How the last knock ended, as the screen's one-line notice.
  const knockNotice = knockClosed
    ? {
        declined: t('knock.declined'),
        'room-gone': t('knock.roomGone'),
        full: t('join.roomFull'),
        'name-taken': t('join.nameTaken'),
      }[knockClosed.reason]
    : '';

  const errorKey = SERVER_ERROR_KEYS[error];
  const displayError = errorKey ? t(errorKey) : error;
  const busy = joining || creating;

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  };

  const roomFaceStyle: React.CSSProperties = {
    width: 26,
    height: 26,
    flexShrink: 0,
    borderRadius: '50%',
    // Cut out of the row background so overlapping faces stay separable.
    border: '2px solid var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
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

  // Joinable rooms first — one tap beats typing, so they lead the list.
  const isJoinable = (r: RoomSummary) =>
    r.status === 'lobby' && r.playerCount < r.maxPlayers;
  const sortedRooms = [...rooms].sort(
    (a, b) => Number(isJoinable(b)) - Number(isJoinable(a))
  );

  const codeSlots = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => i);
  const nextSlot = Math.min(roomCode.length, ROOM_CODE_LENGTH - 1);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '400px',
        alignSelf: 'stretch',
        padding: '1rem 0.2rem 1.1rem',
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
            fontSize: '1.3rem',
          }}
        >
          {/* Reverse cut — the join screen canvas is navy. */}
          <img
            src={`${import.meta.env.BASE_URL}ink-mark-reverse.svg`}
            alt=""
            width={32}
            height={32}
          />
          {/* One flex item, or the row gap would open up inside the wordmark. */}
          <span>
            igra na <span style={{ color: 'var(--amber)' }}>KLIK</span>
          </span>
        </span>
        {/* Language, TV play, rules and zabari.net live in the ⋯ menu so the
            header carries only the brand. */}
        <button
          onClick={() => setMenuOpen(true)}
          aria-label={t('start.menu')}
          style={{
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            borderRadius: 14,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--line)',
            color: 'var(--text-secondary)',
            fontSize: '1.3rem',
            fontWeight: 800,
          }}
        >
          ⋯
        </button>
      </div>

      <h2
        className="display"
        style={{ fontSize: '2.1rem', lineHeight: 1, margin: '2rem 0 0' }}
      >
        {t('join.enterGame')}
      </h2>
      <p
        style={{
          margin: '0.4rem 0 0',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
        }}
      >
        {t('join.tagline')}
      </p>

      {/* Name first: it's needed for every path (code, room list, new room). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.5rem' }}>
        <label htmlFor="join-name" style={labelStyle}>
          {t('join.nameQuestion')}
        </label>
        <input
          id="join-name"
          ref={nameInputRef}
          type="text"
          placeholder={t('join.yourName')}
          maxLength={20}
          autoFocus={allowAutoFocus && (SINGLE_ROOM_MODE || !!roomCode)}
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          style={{
            width: '100%',
            height: '64px',
            padding: '0 1.1rem',
            fontSize: '1.1rem',
            fontWeight: 800,
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1.5px solid var(--line2)',
            borderRadius: '18px',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
        <label htmlFor="join-code" style={labelStyle}>
          {t('join.roomCode')}
        </label>
        {/* Three letter boxes over one transparent input: the real input
            keeps native typing/paste/IME behaviour, the boxes are display. */}
        <div style={{ position: 'relative' }}>
          <div
            aria-hidden
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${ROOM_CODE_LENGTH}, 1fr)`,
              gap: '0.6rem',
            }}
          >
            {codeSlots.map((i) => {
              const ch = SINGLE_ROOM_MODE && fetchingCode ? '' : roomCode[i];
              const isNext = !SINGLE_ROOM_MODE && codeFocused && i === nextSlot;
              return (
                <div
                  key={i}
                  style={{
                    height: '80px',
                    borderRadius: '18px',
                    background: 'var(--bg-secondary)',
                    border: isNext
                      ? '2px solid var(--accent)'
                      : ch
                        ? '2px solid var(--line2)'
                        : '2px dashed var(--line2)',
                    boxShadow: isNext ? '0 0 0 4px rgba(194,155,71,.18)' : 'none',
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '2.5rem',
                    color: SINGLE_ROOM_MODE && fetchingCode ? 'var(--text-secondary)' : 'var(--text-primary)',
                  }}
                >
                  {ch ? (
                    ch
                  ) : isNext ? (
                    <span style={{ width: 2, height: 34, background: 'var(--amber)' }} />
                  ) : null}
                </div>
              );
            })}
          </div>
          {!SINGLE_ROOM_MODE && (
            <input
              id="join-code"
              ref={codeInputRef}
              type="text"
              maxLength={ROOM_CODE_LENGTH}
              autoFocus={allowAutoFocus && !roomCode}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={t('join.roomCode')}
              value={roomCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              onFocus={() => setCodeFocused(true)}
              onBlur={() => setCodeFocused(false)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                // 16px+ so iOS Safari doesn't zoom the page on focus.
                fontSize: '16px',
                cursor: 'text',
              }}
            />
          )}
        </div>
        {!SINGLE_ROOM_MODE && (
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('join.autoJoinHint')}
          </span>
        )}
      </div>

      {error && (
        <p
          role="alert"
          style={{
            color: 'var(--danger)',
            textAlign: 'center',
            fontWeight: 700,
            margin: '0.9rem 0 0',
          }}
        >
          {displayError}
        </p>
      )}
      {!error && knockNotice && (
        <p
          role="status"
          style={{
            color: 'var(--amber)',
            textAlign: 'center',
            fontWeight: 700,
            margin: '0.9rem 0 0',
          }}
        >
          {knockNotice}
        </p>
      )}

      {/* Single-room mode has no auto-join keystroke, so keep the button there
          (and as the manual fallback while a code is complete but unsent). */}
      {(SINGLE_ROOM_MODE || roomCode.length === ROOM_CODE_LENGTH) && (
        <button
          className="btn-primary"
          onClick={() => handleJoin()}
          disabled={busy || fetchingCode}
          style={{ marginTop: '1.25rem' }}
        >
          {joining ? t('join.joining') : t('join.enterGame')}
        </button>
      )}

      {!SINGLE_ROOM_MODE && sortedRooms.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
          <span style={labelStyle}>{t('join.activeRooms')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {sortedRooms.map((r) => {
              const joinable = isJoinable(r);
              // A game in progress: shown so you know the room exists and how
              // far along it is, but it can't be joined from here.
              if (r.status !== 'lobby') {
                return (
                  <div
                    key={r.code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      minHeight: '52px',
                      padding: '0 0.9rem',
                      borderRadius: '16px',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <span
                      className="display"
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        color: 'var(--text-secondary)',
                        minWidth: `${ROOM_CODE_LENGTH + 1}ch`,
                      }}
                    >
                      {r.code}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--amber)' }}>
                        {t('join.inGame')}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--dim)' }}>
                        {r.gameId
                          ? t('join.inGameSummary', {
                              game: t(`game.${r.gameId}.name`),
                              n: r.playerCount,
                            })
                          : t('join.inRoom', { n: r.playerCount })}
                      </span>
                    </span>
                    {/* Pokucaj: only when someone holds control to answer. */}
                    {r.knockable && (() => {
                      const wait = Math.ceil(((knockRetryAt[r.code] ?? 0) - now) / 1000);
                      return (
                        <button
                          onClick={() => knockOn(r.code)}
                          disabled={wait > 0 || busy}
                          style={{
                            height: 40,
                            minHeight: 40,
                            padding: '0 14px',
                            borderRadius: 999,
                            border: '1.5px solid var(--line2)',
                            background: 'transparent',
                            color: wait > 0 ? 'var(--dim)' : 'var(--text-primary)',
                            fontSize: '0.88rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {wait > 0 ? t('knock.retryIn', { n: wait }) : t('knock.button')}
                        </button>
                      );
                    })()}
                  </div>
                );
              }
              return (
                <button
                  key={r.code}
                  onClick={() => pickRoom(r.code)}
                  disabled={!joinable || busy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    minHeight: '60px',
                    padding: '0 0.65rem 0 0.9rem',
                    borderRadius: '16px',
                    background: 'var(--bg-secondary)',
                    // A joinable room is the one thing on this screen you
                    // can act on without typing — give it the gold edge.
                    border: joinable
                      ? '1.5px solid var(--accent)'
                      : '1px solid var(--line2)',
                    opacity: joinable ? 1 : 0.55,
                    textAlign: 'left',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span
                    className="display"
                    style={{
                      fontSize: '1.4rem',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      color: joinable ? 'var(--text-primary)' : 'var(--text-secondary)',
                      minWidth: `${ROOM_CODE_LENGTH + 1}ch`,
                    }}
                  >
                    {r.code}
                  </span>
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    {r.avatars.slice(0, MAX_ROOM_FACES).map((a, i) => (
                      <span
                        key={i}
                        aria-hidden
                        style={{ ...roomFaceStyle, background: a.color, marginLeft: i === 0 ? 0 : '-8px' }}
                      >
                        {a.emoji}
                      </span>
                    ))}
                    {r.playerCount > MAX_ROOM_FACES && (
                      <span
                        aria-hidden
                        style={{
                          ...roomFaceStyle,
                          marginLeft: '-8px',
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
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('join.inRoom', { n: r.playerCount })}
                    </span>
                  </span>
                  {joinable ? (
                    <span
                      style={{
                        height: '40px',
                        padding: '0 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '999px',
                        background: 'var(--accent)',
                        color: 'var(--bg-primary)',
                        fontSize: '0.9rem',
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

      <div style={{ flex: 1, minHeight: '1.25rem' }} />

      {/* Thumb zone: creating a room is its own card, not a ghost button
          squeezed between the form and the room list. */}
      {!SINGLE_ROOM_MODE && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            padding: '1rem',
            borderRadius: '20px',
            background: 'rgba(245,235,224,.06)',
            border: '1px solid var(--line)',
          }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span className="display" style={{ fontWeight: 700, fontSize: '1.15rem', lineHeight: 1.1 }}>
              {t('join.newRoom')}
            </span>
            <span style={{ fontSize: '0.82rem', lineHeight: 1.35, color: 'var(--text-secondary)' }}>
              {t('join.createRoomHint')}
            </span>
          </div>
          <button
            onClick={handleCreate}
            disabled={busy}
            style={{
              height: '48px',
              padding: '0 1.1rem',
              borderRadius: '14px',
              border: '1.5px solid var(--accent)',
              background: 'transparent',
              color: 'var(--amber)',
              fontSize: '0.95rem',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            ＋ {creating ? t('join.creating') : t('join.createShort')}
          </button>
        </div>
      )}

      {/* No "← Početna" link any more: `/` now redirects here. */}
      {knockStatus && <KnockWaitingSheet status={knockStatus} />}
      {menuOpen && (
        <StartMenu
          onClose={() => setMenuOpen(false)}
          onEnterCode={() => {
            setMenuOpen(false);
            // Focus inside the tap's handler, or mobile browsers won't open
            // the keyboard.
            codeInputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
