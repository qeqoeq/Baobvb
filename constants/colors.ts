export const colors = {
    background: {
      primary: '#0F1115',
      secondary: '#1A1D23',
      tertiary: '#242830',
    },
  
    accent: {
      warmGold: '#C8956C',
      softAmber: '#E8B87A',
      deepTeal: '#2A7C7C',
      mutedSage: '#7A9E7E',
      dustyRose: '#B07282',
      softCoral: '#D4816B',
    },
  
    text: {
      primary: '#F2EDE8',
      secondary: '#9A958E',
      muted: '#5C5851',
    },
  
    semantic: {
      growth: '#7A9E7E',
      caution: '#D4A054',
      alert: '#C46B5C',
      trust: '#2A7C7C',
    },
  
    border: {
      soft: '#2B3038',
      strong: '#3A414C',
    },
  } as const;
  
  export type BaobabColors = typeof colors;