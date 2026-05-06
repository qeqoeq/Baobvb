export const colors = {
    background: {
      primary: '#111313',
      secondary: '#171A18',
      tertiary: '#1D211D',
    },

    accent: {
      warmGold: '#D8A85F',
      softAmber: '#E8B87A',
      deepTeal: '#38C8B5',
      leafGreen: '#8FBC72',
      mutedSage: '#7A9E7E',
      dustyRose: '#B07282',
      softCoral: '#E98F6F',
    },

    text: {
      primary: '#F4F1EA',
      secondary: '#B8B3A8',
      muted: '#7E7A72',
    },

    semantic: {
      growth: '#7A9E7E',
      caution: '#D4A054',
      alert: '#C46B5C',
      trust: '#38C8B5',
    },

    border: {
      soft: '#252C25',
      strong: '#303830',
    },
  } as const;

  export type BaobabColors = typeof colors;
