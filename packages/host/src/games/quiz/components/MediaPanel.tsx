import { useEffect, useRef, useState } from 'react';
import type { KvizVideoRef } from '@igra/shared';

/**
 * Media block for audio/video questions. Mount it once per question (keyed by
 * question index) across showing-question AND answering so the clip doesn't
 * restart at the phase flip.
 *
 * Autoplay: most browsers allow it after the interaction that started the
 * game, but some (older smart-TV browsers, strict mobile settings) block
 * sound — a visible manual play control is always rendered as fallback.
 */
export function MediaPanel({
  audioUrl,
  video,
  compact,
}: {
  audioUrl?: string;
  video?: KvizVideoRef;
  compact?: boolean;
}) {
  if (video) {
    const params = new URLSearchParams({ autoplay: '1', rel: '0' });
    if (video.startSeconds !== undefined) params.set('start', String(video.startSeconds));
    if (video.endSeconds !== undefined) params.set('end', String(video.endSeconds));
    return (
      <div
        style={{
          width: compact ? 'min(92vw, 560px)' : 'min(92vw, 860px)',
          aspectRatio: '16 / 9',
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#000',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.videoId}?${params.toString()}`}
          title="Video pitanje"
          allow="autoplay; encrypted-media"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
    );
  }

  if (audioUrl) {
    return <AudioBlock audioUrl={audioUrl} compact={compact} />;
  }

  return null;
}

function AudioBlock({ audioUrl, compact }: { audioUrl: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.play().then(
      () => setBlocked(false),
      () => setBlocked(true) // autoplay refused — the visible controls remain
    );
  }, [audioUrl]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: compact ? '0.8rem 1rem' : '1.2rem 1.6rem',
        boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
      }}
    >
      <span style={{ fontSize: compact ? '2rem' : '3rem' }} aria-hidden>
        🎵
      </span>
      {blocked && (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Pritisni play za zvuk
        </span>
      )}
      <audio
        ref={audioRef}
        src={audioUrl}
        controls
        style={{ width: compact ? '240px' : '340px' }}
      />
    </div>
  );
}
