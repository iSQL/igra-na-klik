import { LANGUAGES, type Language } from '@igra/shared';
import { useLanguageStore } from '../store/languageStore';

const LABELS: Record<Language, string> = { sr: 'SR', en: 'EN' };

/** Compact SR | EN segmented toggle for the per-device UI language. */
export function LanguageSwitch() {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'inline-flex',
        gap: '0.2rem',
        padding: '0.2rem',
        background: 'var(--bg-secondary)',
        borderRadius: '0.6rem',
      }}
    >
      {LANGUAGES.map((lang) => {
        const active = lang === language;
        return (
          <button
            key={lang}
            onClick={(e) => {
              e.stopPropagation();
              setLanguage(lang);
            }}
            aria-pressed={active}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              borderRadius: '0.45rem',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}
