import type { FibbageAnswerOptionPublic } from '@igra/shared';

interface AnswerOptionsProps {
  options: FibbageAnswerOptionPublic[];
}

export function AnswerOptions({ options }: AnswerOptionsProps) {
  return (
    <div style={{ width: '100%', maxWidth: '700px' }}>
      <p
        style={{
          textAlign: 'center',
          fontSize: '1.2rem',
          color: 'var(--text-secondary)',
          marginBottom: '1rem',
        }}
      >
        Šta je pravi odgovor?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {options.map((opt, i) => (
          <div
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem 1.5rem',
              background: 'var(--bg-card)',
              borderRadius: '0.75rem',
              fontSize: '1.3rem',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: 'var(--accent)',
                minWidth: '2rem',
              }}
            >
              {i + 1}.
            </span>
            <span style={{ flex: 1 }}>{opt.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
