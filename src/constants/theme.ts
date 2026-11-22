export const BrandColors = {
  // Warm Alabaster Monochrome Student Bento tokens
  ink: '#141414',
  inkSoft: '#3A3A38',
  muted: '#6F6E6A',
  neutralMid: '#9D9B95',
  inputBorder: '#CBC8C1',
  line: '#DBD9D3',
  soft: '#E4E2DD',
  pageBackground: '#ECEBE7',
  paper: '#F8F7F4',

  // Restrained crimson accent — destructive actions, disabled state, negative AI sentiment
  danger: '#DC2626',
  dangerSoft: '#FBF0EF',

  // Legacy aliases kept for compatibility
  forest: '#141414',
  forestDeep: '#141414',
  forestSoft: '#3A3A38',
  sage: '#9D9B95',
  sageLight: '#DBD9D3',
  softGreen: '#E4E2DD',
  yellow: '#141414',
} as const;

/** Tampilan status sesi yang disimpan di Firestore. */
export const SessionStatusStyles = {
  scheduled: {
    label: 'Belum dibuka',
    bg: '#E4E2DD',
    border: '#DBD9D3',
    text: '#141414',
  },
  open: {
    label: 'Terbuka',
    bg: '#141414',
    border: '#141414',
    text: '#F8F7F4',
  },
  closed: {
    label: 'Selesai',
    bg: '#F8F7F4',
    border: '#DBD9D3',
    text: '#6F6E6A',
  },
  cancelled: {
    label: 'Dibatalkan',
    bg: '#F8F7F4',
    border: '#DC2626',
    text: '#141414',
  },
} as const;
