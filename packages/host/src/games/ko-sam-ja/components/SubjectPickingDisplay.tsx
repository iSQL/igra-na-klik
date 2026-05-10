import type { KoSamJaPublicOption } from '@igra/shared';

interface SubjectPickingDisplayProps {
  subjectName: string;
  options: KoSamJaPublicOption[];
}

export function SubjectPickingDisplay({
  subjectName,
  options,
}: SubjectPickingDisplayProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '700px',
      }}
    >
      <p
        style={{
          fontSize: '1.2rem',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        <strong style={{ color: 'var(--accent)' }}>{subjectName}</strong> bira…
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
          width: '100%',
        }}
      >
        {options.map((opt) => (
          <div
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '120px',
              background: 'var(--bg-card)',
              borderRadius: '1rem',
              padding: '1.5rem',
              fontSize: '1.6rem',
              fontWeight: 700,
              opacity: 0.65,
              textAlign: 'center',
            }}
          >
            {opt.text}
          </div>
        ))}
      </div>
    </div>
  );
}
