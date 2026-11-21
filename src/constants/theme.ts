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

export const SessionStatusColors = {
  BELUM_DIBUKA: {
    bg: '#FEF6DB',
    text: '#8A6100',
    label: 'Belum Dibuka',
  },
  DIBUKA: {
    bg: '#E3F1E5',
    text: '#0B4B46',
    label: 'Sedang Dibuka',
  },
  DITUTUP: {
    bg: '#FDEAEA',
    text: '#B93838',
    label: 'Sesi Ditutup',
  },
} as const;
