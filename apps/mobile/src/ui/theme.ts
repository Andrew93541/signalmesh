// TrackMate brand tokens, taken from the supplied TrekMate logo
// (assets/brand/trekmate-logo.webp). Contrast ratios below are computed
// (WCAG 2.x) against the backgrounds they are used on.
//
// Leaf green and sunrise orange fail contrast as text (≈2.5–2.7:1), so they are
// accents only (illustrations, highlights, progress). Text uses the *Text variants.

export const color = {
  // Surfaces
  bg: '#FFFDF5', // warm off-white
  surface: '#F2F6EF', // secondary background
  surface2: '#E6EDE2', // pressed rows, skeletons (muted text 4.52:1)
  border: '#DCE5D8', // decorative dividers
  borderStrong: '#7A8B7F', // input/control borders: 3.54:1 on bg, 3.30:1 on surface

  // Text
  text: '#19382C', // 12.55:1 on bg
  text2: '#5E6E63', // 5.31:1 on bg (suggested #708075 was 4.10:1 and failed AA)
  text3: '#5E6E63',

  // Brand
  primary: '#075C3B', // forest green; white text on it 8.07:1
  primaryPressed: '#06452F', // dark green; white text 11.05:1
  primarySoft: '#E3EFE6', // forest text on it 6.82:1
  onPrimary: '#FFFFFF',
  leaf: '#68B52E', // accent only
  accent: '#F47B0B', // sunrise orange, accent only
  accentText: '#B25300', // orange for text: 4.99:1 on bg
  accentSoft: '#FFF1E3', // accentText on it 4.59:1

  // Emergency and states
  sos: '#D92D36', // white text on it 4.80:1
  sosText: '#B42318', // 6.46:1 on bg
  sosSoft: '#FDECEA',
  success: '#1A7346', // 5.75:1 on bg
  successSoft: '#E7F5EE',
  warningText: '#8A4B00',
  warningSoft: '#FFF3DC',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, x3: 32, x4: 40, x5: 48 } as const;

// Rounded but professional
export const radius = { s: 10, m: 14, l: 20, full: 999 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  title1: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  title2: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  stat: { fontSize: 28, lineHeight: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
} as const;

export type TypeStyle = keyof typeof type;

export const shadow1 = {
  shadowColor: '#19382C',
  shadowOpacity: 0.08,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;
