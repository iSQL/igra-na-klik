import type { GameAccent } from '@igra/shared';

// Accent hex per token — hex (not CSS var) because icon tiles append alpha
// suffixes (e.g. '2b'/'55'/'22'), which var() can't do. Values mirror the
// brand palette in global.css.
export const ACCENT_HEX: Record<GameAccent, string> = {
  gold: '#c29b47',
  pink: '#d97b6c',
  violet: '#8fa3d9',
  cyan: '#6fc2bb',
  lime: '#a9c46c',
  amber: '#e3b45e',
  danger: '#e06a5e',
  blue: '#6d9bd1',
};
