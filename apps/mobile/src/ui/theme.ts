// TrackMate light theme tokens — values and contrast ratios from docs/DESIGN_SYSTEM.md.

export const color = {
  bg: '#FFFFFF',
  surface: '#F6F7F9',
  surface2: '#EEF1F5',
  border: '#E2E6EC',
  borderStrong: '#7D8799',
  text: '#0F1B2D',
  text2: '#475467',
  text3: '#667085',
  primary: '#1D5FD1',
  primaryPressed: '#174EAD',
  primarySoft: '#EAF1FD',
  onPrimary: '#FFFFFF',
  sos: '#C8261B',
  sosText: '#B42318',
  sosSoft: '#FDECEA',
  success: '#1A7346',
  successSoft: '#E7F5EE',
  warningText: '#8A4B00',
  warningSoft: '#FFF3DC',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, x3: 32, x4: 40, x5: 48 } as const;

export const radius = { s: 8, m: 12, l: 16, full: 999 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  title1: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  title2: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  stat: { fontSize: 28, lineHeight: 34, fontWeight: '600', fontVariant: ['tabular-nums'] },
} as const;

export type TypeStyle = keyof typeof type;

export const shadow1 = {
  shadowColor: '#0F1B2D',
  shadowOpacity: 0.08,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;
