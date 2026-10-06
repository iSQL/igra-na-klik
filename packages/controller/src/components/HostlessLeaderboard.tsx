import { useLayoutEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';

// Your last place in this game — the standings slide your row from there
// (Tok igre 2a). Module-level: a leaderboard is a fresh mount every time.
let lastMyRank: { gameId: string | null; rank: number } | null = null;

// Standings for the phone (Kontroler kit 2f): a top-3 podium, the rest as
// rows, and a pinned "you" card with your place and the gap to the player
// ahead — the number you actually care about. One component for every game
// whose leaderboard entries share this shape (Kviz, Lažov, Ko sam ja, Ko bi
// pre, Asocijacije, Vruć krompir, KvizAtar). In-game strings of these games
// are Serbian by design, so the copy here is too.
export interface LeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
  /** Points won this round — shown as a "+N" chip when present. */
  roundScore?: number;
}

const RANK_INK = ['var(--amber)', '#C9CCE0', '#D8916A'];
const PODIUM_BAR = ['#e3b45e', '#c9cce0', '#d8916a'];

export function formatPoints(n: number): string {
  return n.toLocaleString('sr-RS');
}

export function HostlessLeaderboard({
  title,
  entries,
  myPlayerId,
  embedded,
}: {
  title: string;
  entries: LeaderboardEntry[];
  myPlayerId: string;
  /** Rendered inside another scrolling screen — no own height/scroll/padding,
   *  and no pinned card (the host screen shows your place itself). */
  embedded?: boolean;
}) {
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const emojiOf = (id: string) => roster.find((p) => p.id === id)?.avatarEmoji ?? '';

  // Podium only when there are three to stand on it; fewer read better as rows.
  const podium = entries.length >= 3 ? entries.slice(0, 3) : [];
  const rows = entries.slice(podium.length);
  const myIndex = entries.findIndex((e) => e.playerId === myPlayerId);
  const me = myIndex >= 0 ? entries[myIndex] : undefined;

  // Your row slides from your previous place to the new one (400 ms); the
  // others stand still.
  const gameId = useGameStore((s) => s.gameId);
  const myRowRef = useRef<HTMLDivElement>(null);
  const myRank = me?.rank;
  useLayoutEffect(() => {
    if (myRank === undefined) return;
    const prev = lastMyRank && lastMyRank.gameId === gameId ? lastMyRank.rank : null;
    lastMyRank = { gameId, rank: myRank };
    const el = myRowRef.current;
    if (prev === null || prev === myRank || !el?.animate) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [{ transform: `translateY(${(prev - myRank) * 58}px)` }, { transform: 'none' }],
      { duration: 400, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
  }, [myRank, gameId]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        width: '100%',
        ...(embedded
          ? { padding: '0.5rem 0' }
          : { height: '100%', padding: '0.5rem 0 0', overflowY: 'auto' }),
      }}
    >
      {title && (
        <p
          className="display"
          style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 700, margin: '0.5rem 0 0.4rem' }}
        >
          {title}
        </p>
      )}

      {podium.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.15fr 1fr',
            alignItems: 'end',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {/* 2nd · 1st · 3rd, so the winner stands in the middle. */}
          {[1, 0, 2].map((i) => {
            const e = podium[i];
            const first = i === 0;
            const size = first ? 76 : i === 1 ? 60 : 56;
            return (
              <div
                key={e.playerId}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}
              >
                <span
                  className="avatar-tile"
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: e.avatarColor,
                    fontSize: size / 2,
                    boxShadow: first ? '0 0 30px rgba(227,180,94,.5)' : 'none',
                    outline: e.playerId === myPlayerId ? '2.5px solid var(--text-primary)' : 'none',
                    outlineOffset: 2,
                  }}
                >
                  {emojiOf(e.playerId)}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.playerId === myPlayerId ? 'Ti' : e.name}
                </span>
                <div
                  style={{
                    width: '100%',
                    height: first ? 118 : i === 1 ? 86 : 66,
                    borderRadius: '14px 14px 0 0',
                    background: PODIUM_BAR[i],
                    color: 'var(--bg-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: 8,
                  }}
                >
                  <span className="display" style={{ fontWeight: 700, fontSize: '1.4rem', lineHeight: 1 }}>
                    {e.rank}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{formatPoints(e.score)}</span>
                  {e.roundScore !== undefined && e.roundScore > 0 && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.75 }}>
                      +{e.roundScore}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((e) => {
          const isMe = e.playerId === myPlayerId;
          return (
            <div
              key={e.playerId}
              ref={isMe ? myRowRef : undefined}
              style={{
                position: 'relative',
                zIndex: isMe ? 1 : undefined,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 16,
                background: 'var(--bg-secondary)',
                border: isMe ? '1px solid rgba(194,155,71,.5)' : '1px solid var(--line)',
              }}
            >
              <span
                className="display"
                style={{
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  color: RANK_INK[e.rank - 1] ?? 'var(--dim)',
                  minWidth: 20,
                  textAlign: 'center',
                }}
              >
                {e.rank}
              </span>
              <span
                className="avatar-tile"
                style={{ width: 36, height: 36, backgroundColor: e.avatarColor, fontSize: '1.1rem' }}
              >
                {emojiOf(e.playerId)}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {isMe ? 'Ti' : e.name}
              </span>
              {e.roundScore !== undefined && (
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    color: e.roundScore > 0 ? 'var(--success-ink)' : 'var(--dim)',
                    background: e.roundScore > 0 ? 'rgba(87,179,128,.15)' : 'rgba(255,255,255,.05)',
                    padding: '2px 7px',
                    borderRadius: 7,
                  }}
                >
                  +{e.roundScore}
                </span>
              )}
              <span className="display" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                {formatPoints(e.score)}
              </span>
            </div>
          );
        })}
      </div>

      {!embedded && me && (
        <>
          <div style={{ flex: 1 }} />
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              flexShrink: 0,
              padding: '14px 16px',
              borderRadius: 18,
              background: 'rgba(194,155,71,.14)',
              border: '1px solid rgba(194,155,71,.4)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              className="avatar-tile"
              style={{ width: 40, height: 40, backgroundColor: me.avatarColor, fontSize: '1.25rem' }}
            >
              {emojiOf(me.playerId)}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Ti si {me.rank}.</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {gapLine(entries, myIndex)}
              </span>
            </span>
            <span className="display" style={{ fontWeight: 700, fontSize: '1.4rem' }}>
              {formatPoints(me.score)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// "160 poena iza Ane" — the distance to the next place up; for the leader,
// the lead over second place.
function gapLine(entries: LeaderboardEntry[], i: number): string {
  const me = entries[i];
  if (entries.length < 2) return 'Jedini u igri';
  const ahead = entries.slice(0, i).reverse().find((e) => e.score !== me.score);
  if (!ahead) {
    const tied = entries.find((e, j) => j !== i && e.score === me.score);
    if (tied) return `Izjednačeno sa: ${tied.name}`;
    const next = entries[i + 1];
    return `Vodiš za ${formatPoints(me.score - next.score)} ${pointsWord(me.score - next.score)}`;
  }
  const diff = ahead.score - me.score;
  return `${formatPoints(diff)} ${pointsWord(diff)} iza: ${ahead.name}`;
}

// Serbian count noun: 1 poen, 2–4 poena, 5+ poena (11–14 always "poena").
function pointsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'poen';
  return 'poena';
}
