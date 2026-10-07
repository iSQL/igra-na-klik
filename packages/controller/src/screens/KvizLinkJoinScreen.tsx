import { useEffect, useRef, useState } from 'react';
import { kvizLinkEstimateMinutes, type KvizLinkPublic } from '@igra/shared';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { useKnockStore } from '../store/knockStore';
import { useLanguageStore } from '../store/languageStore';
import { StartMenu } from '../components/StartMenu';
import { KnockWaitingSheet } from '../components/KnockWaitingSheet';
import { readSeen } from '../components/FirstTimeHint';
import { useT } from '../i18n/useT';

// Same key as the regular join screen, so the name follows the player.
const LAST_NAME_KEY = 'igra-player-name';

interface KvizLinkInfo {
  link: KvizLinkPublic;
  status: 'scheduled' | 'active' | 'expired';
  lobby: { code: string; playerCount: number } | null;
  running: { code: string; playerCount: number; knockable: boolean } | null;
  results?: { name: string; emoji: string; color: string; points: number }[];
}

const SERVER_ERROR_KEYS: Record<string, string> = {
  'Name already taken': 'join.nameTaken',
  'Room is full': 'join.roomFull',
};

/**
 * Join screen for a kviz link (/k/<naziv> → /play/?kviz=<naziv>): the quiz's
 * own card instead of the room-code boxes. Entering puts the player in the
 * link's open lobby, or opens one — the first one in holds control.
 */
export function KvizLinkJoinScreen({ slug, onExit }: { slug: string; onExit: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const [info, setInfo] = useState<KvizLinkInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(LAST_NAME_KEY) ?? '');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const knock = useKnockStore((s) => s.knock);
  const knockStatus = useKnockStore((s) => s.status);
  const knockRetryAt = useKnockStore((s) => s.retryAt);

  // The card and the "N already waiting" line; refreshed so a lobby opened by
  // a friend a moment ago shows up before this player taps.
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`/api/k/${encodeURIComponent(slug)}`)
        .then((r) => {
          if (r.status === 404) {
            if (alive) setMissing(true);
            return null;
          }
          return r.ok ? (r.json() as Promise<KvizLinkInfo>) : null;
        })
        .then((d) => {
          if (alive && d) setInfo(d);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug]);

  useEffect(() => {
    const onJoined = () => setJoining(false);
    const onError = ({ message }: { message: string }) => {
      setJoining(false);
      setError(message);
      usePlayerStore.getState().reset();
    };
    socket.on('player:joined', onJoined);
    socket.on('error', onError);
    return () => {
      socket.off('player:joined', onJoined);
      socket.off('error', onError);
    };
  }, []);

  const needName = (): string | null => {
    const name = playerName.trim();
    if (!name) {
      setError(t('join.enterName'));
      nameRef.current?.focus();
      return null;
    }
    localStorage.setItem(LAST_NAME_KEY, name);
    return name;
  };

  const enter = () => {
    const name = needName();
    if (!name) return;
    setError('');
    setJoining(true);
    socket.emit('player:join-kviz-link', { slug, playerName: name, playedGames: readSeen() });
  };

  const knockOn = (code: string) => {
    const name = needName();
    if (!name) return;
    setError('');
    knock(code, name);
  };

  const locale = language === 'en' ? 'en-GB' : 'sr-Latn-RS';
  const day = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const dayTime = (ms: number) =>
    `${day(ms)} ${new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;

  const link = info?.link;
  const waiting = info?.lobby?.playerCount ?? 0;
  const waitingText =
    waiting === 1
      ? t('kviz.waitingOne')
      : waiting % 10 >= 2 && waiting % 10 <= 4 && (waiting % 100 < 12 || waiting % 100 > 14)
        ? t('kviz.waitingFew', { n: waiting })
        : t('kviz.waitingMany', { n: waiting });
  const errorKey = SERVER_ERROR_KEYS[error];
  const displayError = errorKey ? t(errorKey) : error;

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  };
  const chip = (text: string, accent?: boolean): React.ReactNode => (
    <span
      key={text}
      style={{
        fontSize: '0.72rem',
        fontWeight: 800,
        padding: '4px 9px',
        borderRadius: 8,
        background: accent ? 'rgba(227,180,94,.14)' : 'var(--bg-card)',
        color: accent ? 'var(--amber)' : 'var(--text-secondary)',
      }}
    >
      {text}
    </span>
  );

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          className="display"
          style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: 700, fontSize: '1.3rem' }}
        >
          <img src={`${import.meta.env.BASE_URL}ink-mark-reverse.svg`} alt="" width={32} height={32} />
          <span>
            igra na <span style={{ color: 'var(--amber)' }}>KLIK</span>
          </span>
        </span>
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

      {missing ? (
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('kviz.notFound')}</p>
          <button className="btn-primary" onClick={onExit}>
            {t('kviz.useCode')}
          </button>
        </div>
      ) : !link || !info ? (
        <p style={{ marginTop: '2rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{t('common.loading')}</p>
      ) : (
        <>
          <div
            style={{
              marginTop: '1.4rem',
              borderRadius: 24,
              overflow: 'hidden',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line)',
            }}
          >
            <div
              aria-hidden
              style={{
                height: 150,
                backgroundColor: link.color,
                backgroundImage: link.coverUrl
                  ? `url("${link.coverUrl}")`
                  : 'repeating-linear-gradient(135deg, rgba(255,255,255,.06) 0 10px, transparent 10px 20px)',
                backgroundSize: link.coverUrl ? 'cover' : undefined,
                backgroundPosition: 'center',
                display: 'grid',
                placeItems: 'center',
                fontSize: '3.4rem',
              }}
            >
              {!link.coverUrl && link.emoji}
            </div>
            <div style={{ padding: '1rem 1.1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--amber)',
                }}
              >
                {t('kviz.kicker')}
              </span>
              <h1
                className="display"
                style={{ margin: 0, fontWeight: 700, fontSize: '1.7rem', lineHeight: 1.05, overflowWrap: 'anywhere' }}
              >
                {link.emoji} {link.name}
              </h1>
              {link.message && (
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {link.message}
                </span>
              )}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                {link.questionCount > 0 && chip(t('kviz.questions', { n: link.questionCount }))}
                {link.questionCount > 0 && chip(t('kviz.minutes', { n: kvizLinkEstimateMinutes(link) }))}
                {info.status !== 'expired' && chip(t('kviz.validUntil', { date: day(link.expiresAt) }), true)}
              </div>
            </div>
          </div>

          {info.status === 'expired' ? (
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <span className="display" style={{ fontWeight: 700, fontSize: '1.25rem' }}>
                {t('kviz.ended')}
              </span>
              <span style={labelStyle}>{t('kviz.results')}</span>
              {info.results && info.results.length > 0 ? (
                info.results.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.5rem 0.7rem',
                      borderRadius: 14,
                      background: 'var(--bg-secondary)',
                      border: i === 0 ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                    }}
                  >
                    <span style={{ width: '1.4rem', fontWeight: 800, color: 'var(--amber)' }}>{i + 1}.</span>
                    <span className="avatar-tile" style={{ width: 30, height: 30, backgroundColor: r.color, fontSize: '1rem' }}>
                      {r.emoji}
                    </span>
                    <span style={{ flex: 1, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </span>
                    <span className="display" style={{ fontWeight: 700 }}>
                      {r.points.toLocaleString(locale)}
                    </span>
                  </div>
                ))
              ) : (
                <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{t('kviz.noResults')}</span>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.5rem' }}>
                <label htmlFor="kviz-name" style={labelStyle}>
                  {t('join.nameQuestion')}
                </label>
                <input
                  id="kviz-name"
                  ref={nameRef}
                  type="text"
                  placeholder={t('join.yourName')}
                  maxLength={20}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && info.status === 'active' && enter()}
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

              {error && (
                <p role="alert" style={{ color: 'var(--danger)', textAlign: 'center', fontWeight: 700, margin: '0.9rem 0 0' }}>
                  {displayError}
                </p>
              )}

              {/* A game already running and no open lobby: knock on it, or open a new lobby. */}
              {info.status === 'active' && !info.lobby && info.running && (
                <div
                  style={{
                    marginTop: '1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.6rem 0.9rem',
                    borderRadius: 16,
                    border: '1px solid var(--line)',
                  }}
                >
                  <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 800, color: 'var(--amber)' }}>
                    {t('kviz.inGame', { n: info.running.playerCount })}
                  </span>
                  {info.running.knockable &&
                    (() => {
                      const code = info.running.code;
                      const wait = Math.ceil(((knockRetryAt[code] ?? 0) - Date.now()) / 1000);
                      return (
                        <button
                          onClick={() => knockOn(code)}
                          disabled={wait > 0 || joining}
                          style={{
                            height: 40,
                            minHeight: 40,
                            padding: '0 14px',
                            borderRadius: 999,
                            border: '1.5px solid var(--line2)',
                            background: 'transparent',
                            color: 'var(--text-primary)',
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
              )}

              <button
                className="btn-primary"
                onClick={enter}
                disabled={joining || info.status !== 'active' || link.questionCount === 0}
                style={{ marginTop: '1.25rem' }}
              >
                {info.status === 'scheduled'
                  ? t('kviz.startsAt', { date: dayTime(link.validFrom) })
                  : link.questionCount === 0
                    ? t('kviz.noQuestions')
                    : joining
                      ? t('join.joining')
                      : !info.lobby && info.running
                        ? t('kviz.newGame')
                        : t('kviz.enter')}
              </button>
              <span
                style={{
                  marginTop: '0.7rem',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                {info.lobby ? waitingText : t('kviz.firstIn')}
              </span>
            </>
          )}
        </>
      )}

      <div style={{ flex: 1, minHeight: '1.25rem' }} />
      {!missing && (
        <a
          href={`/k/${encodeURIComponent(slug)}/uredi`}
          style={{
            alignSelf: 'center',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: 'var(--dim)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            padding: '0.5rem',
          }}
        >
          {t('kviz.edit')}
        </a>
      )}

      {knockStatus && <KnockWaitingSheet status={knockStatus} />}
      {menuOpen && (
        <StartMenu
          onClose={() => setMenuOpen(false)}
          onEnterCode={() => {
            setMenuOpen(false);
            onExit();
          }}
        />
      )}
    </div>
  );
}
