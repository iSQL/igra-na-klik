import { useCallback } from 'react';
import { translate } from '@igra/shared';
import { useLanguageStore } from '../store/languageStore';

/**
 * Returns a translate function `t(key, params?)` bound to the current
 * per-device language. Re-renders the calling component when the language
 * changes (it subscribes to the language store).
 */
export function useT() {
  const lang = useLanguageStore((s) => s.language);
  return useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(lang, key, params),
    [lang]
  );
}
