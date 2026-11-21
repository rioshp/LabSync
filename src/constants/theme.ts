export const BrandColors = {
  forest: '#0B4B46',
  forestDeep: '#063431',
  forestSoft: '#14655A',
  sage: '#75A981',
  sageLight: '#DCEBDD',
  softGreen: '#E3F1E5',
  yellow: '#FCBF2F',
  danger: '#D94D4D',
  ink: '#123F3B',
  muted: '#70837A',
  line: '#DFE8DF',
  paper: '#FFFFFF',
  pageBackground: '#F4FAF7',
} as const;

/** One presentation for the statuses stored in Firestore and used by the local demo. */
export const SessionStatusStyles = {
  scheduled: { label: 'Belum dibuka', bg: '#FEF6DB', text: '#8A6100' },
  open: { label: 'Terbuka', bg: '#E3F1E5', text: '#0B4B46' },
  closed: { label: 'Selesai', bg: '#FDEAEA', text: '#B93838' },
  cancelled: { label: 'Dibatalkan', bg: '#F1E8E7', text: '#775450' },
} as const;
