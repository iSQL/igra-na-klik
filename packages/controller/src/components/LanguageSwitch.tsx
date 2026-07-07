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
        padding: '3px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--line)',
        borderRadius: '10px',
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
              padding: '0.35rem 0.7rem',
              fontSize: '0.75rem',
              fontWeight: 800,
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--grad)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              minHeight: 'unset',
              minWidth: 'unset',
            }}
          >
            {LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}
