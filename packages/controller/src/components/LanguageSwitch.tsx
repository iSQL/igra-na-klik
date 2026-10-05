import { LANGUAGES, type Language } from '@igra/shared';
import { useLanguageStore } from '../store/languageStore';

const LABELS: Record<Language, string> = { sr: 'SR', en: 'EN' };
// Each language named in itself, so the switch reads right from either side.
const FULL_LABELS: Record<Language, string> = { sr: 'Srpski', en: 'English' };

/**
 * SR | EN segmented toggle for the per-device UI language. `large` is the
 * menu-row size with full names (Srpski / English, 40px targets).
 */
export function LanguageSwitch({ large = false }: { large?: boolean }) {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'inline-flex',
        padding: large ? '4px' : '3px',
        background: large ? 'var(--bg-primary)' : 'var(--bg-secondary)',
        border: large ? 'none' : '1px solid var(--line)',
        borderRadius: large ? '12px' : '10px',
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
              padding: large ? '0 18px' : '0.35rem 0.7rem',
              height: large ? 40 : undefined,
              fontSize: large ? '0.88rem' : '0.75rem',
              fontWeight: 800,
              borderRadius: large ? '9px' : '7px',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--text-primary)' : 'transparent',
              color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
              minHeight: 'unset',
              minWidth: 'unset',
            }}
          >
            {large ? FULL_LABELS[lang] : LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}
