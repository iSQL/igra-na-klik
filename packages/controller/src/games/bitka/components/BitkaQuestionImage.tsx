import { useEffect, useState } from 'react';

/**
 * Slika uz pitanje u KvizAtar-u.
 *
 * Kviz pakovi nose `imageUrl` i na izbornim i na broj-pitanjima, ali ju je od
 * svih ekrana prikazivao samo klizač — pa je pitanje tipa „koji je ovo grb"
 * ostajalo bez slike i na telefonu i na TV-u. Visina je ograničena udelom
 * ekrana, jer ispod nje moraju da stanu opcije na koje se kuca. Ako link pukne,
 * element se skloni umesto da ostavi razbijenu ikonicu.
 */
export function BitkaQuestionImage({ url, maxHeight = '30vh' }: { url?: string; maxHeight?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        maxHeight,
        maxWidth: '100%',
        margin: '0 auto',
        objectFit: 'contain',
        borderRadius: '0.6rem',
        border: '1px solid var(--line)',
        background: 'rgba(0,0,0,0.25)',
        flexShrink: 0,
      }}
    />
  );
}
