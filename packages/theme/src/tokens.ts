/**
 * The design tokens from globals.css as plain values, for React Native (the
 * rider app), where CSS variables aren't available. Keep in sync with globals.css.
 */
export const colors = {
  background: '#f7f8fb',
  foreground: '#0f172a',
  card: '#ffffff',
  cardForeground: '#0f172a',
  muted: '#f1f4f9',
  mutedForeground: '#5b6477',
  border: '#e3e7ef',
  input: '#d6dce7',
  ring: '#7a7bee',

  primary: '#3230aa',
  primaryHover: '#2a288f',
  primaryForeground: '#ffffff',
  primarySoft: '#eff0ff',

  accent: '#ffac20',
  accentHover: '#f98b07',
  accentForeground: '#3b1a03',
  accentSoft: '#fff8eb',

  success: '#12805c',
  successSoft: '#e7f6ef',
  warning: '#b45309',
  warningSoft: '#fff4e0',
  destructive: '#d42f2f',
  destructiveSoft: '#fdecec',
  info: '#3230aa',
  infoSoft: '#eff0ff',

  /** Logo colours. */
  brandBlue: '#3230aa',
  brandYellow: '#fbd23a',
  brandNavy: '#12123a',
} as const;

export const radius = { sm: 6, md: 8, lg: 12, xl: 16 } as const;

export type ColorToken = keyof typeof colors;
