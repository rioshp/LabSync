export const BrandColors = {
  // Monochrome Student Bento v3 tokens
  ink: '#18181B',
  inkSoft: '#3F3F46',
  muted: '#71717A',
  neutralMid: '#A1A1AA',
  inputBorder: '#D4D4D8',
  line: '#E4E4E7',
  soft: '#EDEDEF',
  pageBackground: '#F4F4F5',
  paper: '#FFFFFF',

  // Restrained crimson accent — destructive actions, disabled state, negative AI sentiment
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',

  // Legacy aliases kept for incremental migration across stages
  forest: '#18181B',
  forestDeep: '#18181B',
  forestSoft: '#3F3F46',
  sage: '#A1A1AA',
  sageLight: '#E4E4E7',
  softGreen: '#EDEDEF',
  yellow: '#18181B',
} as const;

/** Tampilan status sesi yang disimpan di Firestore. */
export const SessionStatusStyles = {
  scheduled: {
    label: 'Belum dibuka',
    bg: '#EDEDEF',
    border: '#E4E4E7',
    text: '#18181B',
  },
  open: {
    label: 'Terbuka',
    bg: '#18181B',
    border: '#18181B',
    text: '#FFFFFF',
  },
  closed: {
    label: 'Selesai',
    bg: '#FFFFFF',
    border: '#E4E4E7',
    text: '#71717A',
  },
  cancelled: {
    label: 'Dibatalkan',
    bg: '#FFFFFF',
    border: '#DC2626',
    text: '#18181B',
  },
} as const;
